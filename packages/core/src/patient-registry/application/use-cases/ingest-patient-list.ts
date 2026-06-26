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
  AdmissionRepository,
  AuditLog,
  ExistingPatient,
  HospitalRepository,
  PatientRepository,
  PatientUpdate,
  RawRowStore,
  SensitiveDataStore,
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
  rawRows: RawRowStore;
  patients: PatientRepository;
  hospitals: HospitalRepository;
  admissions: AdmissionRepository;
  sensitive: SensitiveDataStore;
  audit: AuditLog;
  newId: () => string;
}

// Caso de uso de ingesta: parsea, deduplica (ADR-003) y persiste vía ports.
export class IngestPatientList {
  constructor(private readonly deps: IngestDependencies) {}

  async execute(input: {
    fileBytes: Uint8Array;
    uploadedBy: string | null;
  }): Promise<IngestionSummary> {
    const { parser, rawRows, patients, hospitals, admissions, sensitive, audit, newId } =
      this.deps;
    const { sheet, rows } = parser.parse(input.fileBytes);

    // Dedupe dentro del archivo por fingerprint.
    const seen = new Set<string>();
    const unique = rows.filter((r) =>
      seen.has(r.fingerprint) ? false : (seen.add(r.fingerprint), true),
    );

    const fileId = newId();

    // Resolver cada hospital una sola vez.
    const hospitalIds = new Map<string, string>();
    for (const r of unique) {
      if (r.hospitalName && !hospitalIds.has(r.hospitalName)) {
        hospitalIds.set(r.hospitalName, await hospitals.resolveByName(r.hospitalName));
      }
    }

    const newFingerprints = await rawRows.persistNew(unique, {
      fileId,
      uploadedBy: input.uploadedBy,
    });
    const toProcess = unique.filter((r) => newFingerprints.has(r.fingerprint));

    const candidates: ExistingPatient[] = await patients.loadAll();
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

      const decision = decideMatch({ name, document }, candidates);

      let patientId: string;
      if (decision.kind === "merge") {
        patientId = decision.targetId;
        const target = candidates.find((c) => c.id === patientId)!;
        const changes: PatientUpdate = {};
        if (isMinor && !target.isMinor) changes.isMinor = true;
        if (document?.isValid && !target.document?.isValid) changes.document = document;
        if (deceased && target.status !== "deceased") changes.status = "deceased";
        if (Object.keys(changes).length > 0) {
          await patients.update(patientId, changes);
          Object.assign(target, changes);
        }
        summary.mergedPatients++;
      } else {
        patientId = await patients.create({ name, document, age: r.age, isMinor, status });
        candidates.push({ id: patientId, name, document, isMinor, status });
        if (decision.kind === "conflict") {
          summary.documentConflicts++;
          await audit.record({
            actorId: input.uploadedBy,
            action: "dedup_document_conflict",
            entity: "patient",
            entityId: patientId,
            payload: { document: document?.normalized },
          });
        } else if (decision.kind === "review") {
          summary.pendingReview++;
          await audit.record({
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

      // Ingreso (persona ↔ hospital); permite traslados.
      let admissionId: string | null = null;
      if (r.hospitalName) {
        const hospitalId = hospitalIds.get(r.hospitalName)!;
        const key = `${patientId}|${hospitalId}`;
        admissionId =
          admissionByKey.get(key) ?? (await admissions.findId(patientId, hospitalId));
        if (!admissionId) {
          admissionId = await admissions.create({ patientId, hospitalId, status });
          admissionByKey.set(key, admissionId);
          summary.newAdmissions++;
        }
      }

      // Datos sensibles (esquema aislado).
      if (r.phone || r.address) {
        await sensitive.saveContact({ patientId, phone: r.phone, address: r.address });
      }
      if (r.clinicalNotes && admissionId) {
        await sensitive.saveClinicalNote({ admissionId, text: r.clinicalNotes });
      }
    }

    await audit.record({
      actorId: input.uploadedBy,
      action: "ingest_patient_list",
      entity: "raw_rows",
      entityId: null,
      payload: { fileId, ...summary },
    });

    return summary;
  }
}
