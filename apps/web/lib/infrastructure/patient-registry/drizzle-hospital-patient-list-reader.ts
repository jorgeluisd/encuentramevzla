import { asc, eq, inArray } from "drizzle-orm";
import { admissions, clinicalNotes, contacts, patients } from "@evzla/db";
import type { getDb } from "@evzla/db/client";
import type {
  HospitalPatientListItem,
  HospitalPatientListReader,
} from "@evzla/core";

type Db = ReturnType<typeof getDb>;

/**
 * Lista (con IDs) de lo cargado por un hospital, para la vista Cargar (lista en vivo + editar).
 * Incluye sensibles para prefilling del panel; filtra por hospitalId vía service_role.
 * Igual que el export, evita el fan-out del JOIN a `sensitive` cargando contactos/notas por lote.
 */
export class DrizzleHospitalPatientListReader implements HospitalPatientListReader {
  constructor(private readonly db: Db) {}

  async listForHospital(hospitalId: string): Promise<HospitalPatientListItem[]> {
    const base = await this.db
      .select({
        admissionId: admissions.id,
        patientId: admissions.patientId,
        fullName: patients.normalizedName,
        documentNumber: patients.normalizedDocNumber,
        age: patients.age,
        status: admissions.status,
        isMinor: patients.isMinor,
      })
      .from(admissions)
      .innerJoin(patients, eq(patients.id, admissions.patientId))
      .where(eq(admissions.hospitalId, hospitalId))
      .orderBy(asc(patients.normalizedName));

    if (base.length === 0) return [];

    const patientIds = [...new Set(base.map((r) => r.patientId))];
    const admissionIds = base.map((r) => r.admissionId);

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

    const noteRows = await this.db
      .select({ admissionId: clinicalNotes.admissionId, note: clinicalNotes.note })
      .from(clinicalNotes)
      .where(inArray(clinicalNotes.admissionId, admissionIds));
    const noteByAdmission = new Map<string, string | null>();
    for (const n of noteRows) {
      if (!noteByAdmission.has(n.admissionId)) noteByAdmission.set(n.admissionId, n.note);
    }

    return base.map((r) => {
      const contact = contactByPatient.get(r.patientId);
      return {
        patientId: r.patientId,
        admissionId: r.admissionId,
        fullName: r.fullName,
        documentNumber: r.documentNumber,
        age: r.age,
        status: r.status,
        isMinor: r.isMinor,
        phone: contact?.phone ?? null,
        address: contact?.address ?? null,
        clinicalNotes: noteByAdmission.get(r.admissionId) ?? null,
      };
    });
  }
}
