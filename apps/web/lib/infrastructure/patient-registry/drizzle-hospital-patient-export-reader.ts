import { asc, eq, inArray } from "drizzle-orm";
import { admissions, clinicalNotes, contacts, hospitals, patients } from "@evzla/db";
import type { getDb } from "@evzla/db/client";
import type { ExportRow, HospitalPatientExportReader } from "@evzla/core";

type Db = ReturnType<typeof getDb>;

/**
 * Lectura del export de UN hospital (público + sensible) por conexión directa (service_role).
 * Filtra SIEMPRE por hospitalId (el scope adicional lo valida el caso de uso).
 *
 * Se evita el JOIN directo contra `sensitive.contacts`/`clinical_notes` para no multiplicar
 * filas (fan-out): se trae la base por admisión y luego se mapean contactos/notas por lote.
 */
export class DrizzleHospitalPatientExportReader implements HospitalPatientExportReader {
  constructor(private readonly db: Db) {}

  async loadForHospital(hospitalId: string): Promise<ExportRow[]> {
    // Base: una fila por admisión del hospital (ingreso = paciente ↔ hospital).
    const base = await this.db
      .select({
        admissionId: admissions.id,
        patientId: admissions.patientId,
        hospitalName: hospitals.name,
        fullName: patients.normalizedName,
        age: patients.age,
        documentNumber: patients.normalizedDocNumber,
        status: admissions.status,
        isMinor: patients.isMinor,
      })
      .from(admissions)
      .innerJoin(patients, eq(patients.id, admissions.patientId))
      .innerJoin(hospitals, eq(hospitals.id, admissions.hospitalId))
      .where(eq(admissions.hospitalId, hospitalId))
      .orderBy(asc(patients.normalizedName));

    if (base.length === 0) return [];

    const patientIds = [...new Set(base.map((r) => r.patientId))];
    const admissionIds = base.map((r) => r.admissionId);

    // Contacto por paciente (el primero, si hay varios): teléfono/dirección.
    const contactRows = await this.db
      .select({ patientId: contacts.patientId, phone: contacts.phone, address: contacts.address })
      .from(contacts)
      .where(inArray(contacts.patientId, patientIds));
    const contactByPatient = new Map<string, { phone: string | null; address: string | null }>();
    for (const c of contactRows) {
      if (!contactByPatient.has(c.patientId)) {
        contactByPatient.set(c.patientId, { phone: c.phone, address: c.address });
      }
    }

    // Notas clínicas por admisión (concatenadas si hay varias).
    const noteRows = await this.db
      .select({ admissionId: clinicalNotes.admissionId, note: clinicalNotes.note })
      .from(clinicalNotes)
      .where(inArray(clinicalNotes.admissionId, admissionIds));
    const notesByAdmission = new Map<string, string[]>();
    for (const n of noteRows) {
      if (!n.note) continue;
      const list = notesByAdmission.get(n.admissionId) ?? [];
      list.push(n.note);
      notesByAdmission.set(n.admissionId, list);
    }

    return base.map((r) => {
      const contact = contactByPatient.get(r.patientId);
      const notes = notesByAdmission.get(r.admissionId);
      return {
        hospitalName: r.hospitalName,
        fullName: r.fullName,
        age: r.age,
        documentNumber: r.documentNumber,
        status: r.status,
        isMinor: r.isMinor,
        phone: contact?.phone ?? null,
        address: contact?.address ?? null,
        clinicalNotes: notes && notes.length > 0 ? notes.join(" — ") : null,
      };
    });
  }
}
