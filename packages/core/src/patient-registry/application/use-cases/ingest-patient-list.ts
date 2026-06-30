import { decideMatch } from "../../domain/services/patient-matching";
import { DocumentId } from "../../domain/value-objects/document-id";
import { PersonName } from "../../domain/value-objects/person-name";
import {
  isMinorAge,
  looksDeceased,
  type PatientStatus,
} from "../../domain/value-objects/patient-status";
import type { PatientListParser } from "../ports/patient-list-parser";
import type {
  AuditEntry,
  ExistingPatient,
  IngestionUnitOfWork,
  NewAdmissionRow,
  NewClinicalNoteRow,
  NewContactRow,
  NewPatientRow,
  PatientUpdate,
  PatientUpdateRow,
} from "../ports/repositories";

export interface IngestionSummary {
  sheet: string;
  rowsRead: number;
  uniqueRows: number;
  newRows: number;
  alreadyPresent: number;
  hospitals: number;
  newPatients: number;
  mergedPatients: number;
  documentConflicts: number;
  pendingReview: number;
  newAdmissions: number;
  minors: number;
  deceased: number;
}

export interface IngestDependencies {
  parser: PatientListParser;
  uow: IngestionUnitOfWork;
  newId: () => string;
}

// Caso de uso de ingesta: parsea, deduplica (ADR-003) y persiste en lote.
// Dos fases: (1) todo el dedup en memoria armando el grafo con IDs propios, y
// (2) persistencia bulk en UNA transacción (atomicidad por archivo, anti-N+1).
export class IngestPatientList {
  constructor(private readonly deps: IngestDependencies) {}

  async execute(input: {
    fileBytes: Uint8Array;
    uploadedBy: string | null;
  }): Promise<IngestionSummary> {
    const { parser, uow, newId } = this.deps;
    const { sheet, rows } = parser.parse(input.fileBytes);

    const seen = new Set<string>();
    const unique = rows.filter((r) =>
      seen.has(r.fingerprint) ? false : (seen.add(r.fingerprint), true),
    );

    const fileId = newId();

    return uow.runAtomic(async (repos) => {
      // Resolver cada hospital una sola vez (dentro de la tx: atómico).
      const hospitalIds = new Map<string, string>();
      for (const r of unique) {
        if (r.hospitalName && !hospitalIds.has(r.hospitalName)) {
          hospitalIds.set(r.hospitalName, await repos.hospitals.resolveByName(r.hospitalName));
        }
      }

      const newFingerprints = await repos.rawRows.persistNew(unique, {
        fileId,
        uploadedBy: input.uploadedBy,
      });
      const toProcess = unique.filter((r) => newFingerprints.has(r.fingerprint));

      // Claves del lote para acotar candidatos (no toda la tabla): cédula o ≥1 token de nombre.
      const documents = new Set<string>();
      const tokens = new Set<string>();
      for (const r of toProcess) {
        if (!r.fullName) continue;
        const name = PersonName.fromRaw(r.fullName);
        if (name.isEmpty) continue;
        for (const t of name.tokens) tokens.add(t);
        const document = r.documentNumber ? DocumentId.fromRaw(r.documentNumber) : null;
        if (document?.isValid) documents.add(document.normalized);
      }
      const loaded = await repos.patients.loadCandidates({
        documents: [...documents],
        tokens: [...tokens],
      });

      // Admisiones SOLO de los candidatos (no toda la tabla): para reusar ingresos
      // existentes y desambiguar homónimos. Los pacientes nuevos no tienen admisiones.
      const existingAdmissions = await repos.admissions.loadExistingIds(
        loaded.map((c) => c.id),
      );

      // patientId → hospitales con ingreso (desambigua homónimos sin cédula). El Set se
      // comparte con el candidato, así que sumar una admisión nueva se refleja en el matching.
      const patientHospitals = new Map<string, Set<string>>();
      const hospitalsOf = (patientId: string): Set<string> => {
        let set = patientHospitals.get(patientId);
        if (!set) {
          set = new Set<string>();
          patientHospitals.set(patientId, set);
        }
        return set;
      };
      for (const key of existingAdmissions.keys()) {
        const [pid, hid] = key.split("|");
        if (pid && hid) hospitalsOf(pid).add(hid);
      }

      const candidates: ExistingPatient[] = loaded.map((c) => ({
        ...c,
        hospitalIds: hospitalsOf(c.id),
      }));

      // Acumuladores en memoria (se persisten en lote al final).
      const patientsToInsert: NewPatientRow[] = [];
      const patientUpdates = new Map<string, PatientUpdate>();
      const admissionsToInsert: NewAdmissionRow[] = [];
      const contactsToInsert: NewContactRow[] = [];
      const notesToInsert: NewClinicalNoteRow[] = [];
      const dedupEntries: AuditEntry[] = [];
      const admissionByKey = new Map<string, string>();

      const summary: IngestionSummary = {
        sheet,
        rowsRead: rows.length,
        uniqueRows: unique.length,
        newRows: newFingerprints.size,
        alreadyPresent: unique.length - newFingerprints.size,
        hospitals: hospitalIds.size,
        newPatients: 0,
        mergedPatients: 0,
        documentConflicts: 0,
        pendingReview: 0,
        newAdmissions: 0,
        minors: 0,
        deceased: 0,
      };

      for (const r of toProcess) {
        if (!r.fullName) continue;
        const name = PersonName.fromRaw(r.fullName);
        if (name.isEmpty) continue;
        const document = r.documentNumber ? DocumentId.fromRaw(r.documentNumber) : null;
        const isMinor = isMinorAge(r.age);
        const deceased = looksDeceased(r.clinicalNotes);
        const status: PatientStatus = deceased ? "deceased" : "admitted";

        const incomingHospitalId = r.hospitalName
          ? (hospitalIds.get(r.hospitalName) ?? null)
          : null;
        const decision = decideMatch({ name, document }, candidates, incomingHospitalId);

        let patientId: string;
        if (decision.kind === "merge") {
          patientId = decision.targetId;
          const target = candidates.find((c) => c.id === patientId)!;
          const changes: PatientUpdate = {};
          if (isMinor && !target.isMinor) changes.isMinor = true;
          if (document?.isValid && !target.document?.isValid) changes.document = document;
          if (deceased && target.status !== "deceased") changes.status = "deceased";
          if (Object.keys(changes).length > 0) {
            patientUpdates.set(patientId, { ...patientUpdates.get(patientId), ...changes });
            Object.assign(target, changes);
          }
          summary.mergedPatients++;
        } else {
          patientId = newId();
          patientsToInsert.push({ id: patientId, name, document, age: r.age, isMinor, status });
          candidates.push({ id: patientId, name, document, isMinor, status, hospitalIds: hospitalsOf(patientId) });
          if (decision.kind === "conflict") {
            summary.documentConflicts++;
            dedupEntries.push({
              actorId: input.uploadedBy,
              action: "dedup_document_conflict",
              entity: "patient",
              entityId: patientId,
              payload: { document: document?.normalized },
            });
          } else if (decision.kind === "review") {
            summary.pendingReview++;
            dedupEntries.push({
              actorId: input.uploadedBy,
              action: "dedup_pending_review",
              entity: "patient",
              entityId: patientId,
            });
          } else {
            summary.newPatients++;
          }
        }

        if (isMinor) summary.minors++;
        if (deceased) summary.deceased++;

        // Ingreso (persona ↔ hospital); permite traslados. Reusa la admisión
        // existente (mismo archivo o ya en DB) en lugar de duplicarla.
        let admissionId: string | null = null;
        if (r.hospitalName) {
          const hospitalId = hospitalIds.get(r.hospitalName)!;
          const key = `${patientId}|${hospitalId}`;
          admissionId = admissionByKey.get(key) ?? existingAdmissions.get(key) ?? null;
          if (!admissionId) {
            admissionId = newId();
            admissionsToInsert.push({ id: admissionId, patientId, hospitalId, status });
            admissionByKey.set(key, admissionId);
            summary.newAdmissions++;
          } else {
            admissionByKey.set(key, admissionId);
          }
          hospitalsOf(patientId).add(hospitalId);
        }

        // Datos sensibles (esquema aislado).
        if (r.phone || r.address) {
          contactsToInsert.push({ patientId, phone: r.phone, address: r.address });
        }
        if (r.clinicalNotes && admissionId) {
          notesToInsert.push({ admissionId, text: r.clinicalNotes });
        }
      }

      // Fase de persistencia: una llamada bulk por tabla (orden por FKs).
      if (patientsToInsert.length > 0) await repos.patients.createMany(patientsToInsert);
      if (patientUpdates.size > 0) {
        const updates: PatientUpdateRow[] = [...patientUpdates].map(([id, changes]) => ({
          id,
          changes,
        }));
        await repos.patients.updateMany(updates);
      }
      if (admissionsToInsert.length > 0) await repos.admissions.createMany(admissionsToInsert);
      if (contactsToInsert.length > 0) await repos.sensitive.saveContacts(contactsToInsert);
      if (notesToInsert.length > 0) await repos.sensitive.saveClinicalNotes(notesToInsert);

      await repos.audit.recordMany([
        ...dedupEntries,
        {
          actorId: input.uploadedBy,
          action: "ingest_patient_list",
          entity: "raw_rows",
          entityId: null,
          payload: { fileId, ...summary },
        },
      ]);

      return summary;
    });
  }
}
