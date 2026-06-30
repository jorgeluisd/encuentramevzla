import { and, asc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { admissions, clinicalNotes, contacts, patients } from "@evzla/db";
import type { getDb } from "@evzla/db/client";
import type {
  HospitalPatientListItem,
  HospitalPatientListPage,
  HospitalPatientListQuery,
  HospitalPatientListReader,
} from "@evzla/core";

type Db = ReturnType<typeof getDb>;

// Normaliza el término para que matchee las columnas normalizadas: nombre en minúsculas
// sin acentos; cédula solo alfanumérico en mayúsculas (igual que normalized_doc_number).
function nameNeedle(term: string): string {
  return `%${term.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()}%`;
}
function docNeedle(term: string): string {
  return `%${term.replace(/[^0-9A-Za-z]/g, "").toUpperCase()}%`;
}

/**
 * Lista paginada (con IDs) de lo cargado por un hospital, para la vista Cargar.
 * Filtra por hospitalId (service_role) + búsqueda opcional por nombre/cédula, con LIMIT/OFFSET
 * para no traer miles de filas. Incluye sensibles SOLO de la página para prefilling del panel;
 * evita el fan-out del JOIN a `sensitive` cargando contactos/notas por lote.
 */
export class DrizzleHospitalPatientListReader implements HospitalPatientListReader {
  constructor(private readonly db: Db) {}

  async listForHospital(query: HospitalPatientListQuery): Promise<HospitalPatientListPage> {
    const term = (query.search ?? "").trim();
    const filters: SQL[] = [eq(admissions.hospitalId, query.hospitalId)];
    if (term) {
      filters.push(
        or(
          ilike(patients.normalizedName, nameNeedle(term)),
          ilike(patients.normalizedDocNumber, docNeedle(term)),
        )!,
      );
    }
    const where = and(...filters);

    const [{ total = 0 } = {}] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(admissions)
      .innerJoin(patients, eq(patients.id, admissions.patientId))
      .where(where);

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
      .where(where)
      .orderBy(asc(patients.normalizedName))
      .limit(query.limit)
      .offset(query.offset);

    if (base.length === 0) return { items: [], total };

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

    const items: HospitalPatientListItem[] = base.map((r) => {
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
    return { items, total };
  }
}
