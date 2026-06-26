import { and, eq } from "drizzle-orm";
import {
  admissions,
  auditLog,
  clinicalNotes,
  contacts,
  hospitals,
  patients,
  rawRows,
} from "@evzla/db";
import type { getDb } from "@evzla/db/client";
import {
  DocumentId,
  PersonName,
  type AdmissionRepository,
  type AuditEntry,
  type AuditLog,
  type ExistingPatient,
  type HospitalRepository,
  type NewPatient,
  type ParsedPatientRow,
  type PatientRepository,
  type PatientUpdate,
  type RawRowStore,
  type SensitiveDataStore,
} from "@evzla/core";

type Db = ReturnType<typeof getDb>;

export class DrizzlePatientRepository implements PatientRepository {
  constructor(private readonly db: Db) {}

  async loadAll(): Promise<ExistingPatient[]> {
    const rows = await this.db
      .select({
        id: patients.id,
        name: patients.normalizedName,
        document: patients.normalizedDocNumber,
        isMinor: patients.isMinor,
        status: patients.status,
      })
      .from(patients);
    return rows.map((r) => ({
      id: r.id,
      name: PersonName.fromRaw(r.name),
      document: r.document ? DocumentId.fromRaw(r.document) : null,
      isMinor: r.isMinor,
      status: r.status,
    }));
  }

  async create(patient: NewPatient): Promise<string> {
    const [row] = await this.db
      .insert(patients)
      .values({
        normalizedName: patient.name.normalized,
        nameTokens: [...patient.name.tokens],
        age: patient.age,
        normalizedDocNumber:
          patient.document && patient.document.isValid ? patient.document.normalized : null,
        status: patient.status,
        isMinor: patient.isMinor,
      })
      .returning({ id: patients.id });
    return row!.id;
  }

  async update(id: string, changes: PatientUpdate): Promise<void> {
    const values: Partial<typeof patients.$inferInsert> = {};
    if (changes.document) values.normalizedDocNumber = changes.document.normalized;
    if (changes.isMinor !== undefined) values.isMinor = changes.isMinor;
    if (changes.status) values.status = changes.status;
    if (Object.keys(values).length > 0) {
      await this.db.update(patients).set(values).where(eq(patients.id, id));
    }
  }
}

export class DrizzleHospitalRepository implements HospitalRepository {
  constructor(private readonly db: Db) {}

  async resolveByName(name: string): Promise<string> {
    const existing = await this.db
      .select({ id: hospitals.id })
      .from(hospitals)
      .where(eq(hospitals.name, name))
      .limit(1);
    if (existing[0]) return existing[0].id;
    const [row] = await this.db
      .insert(hospitals)
      .values({ name })
      .returning({ id: hospitals.id });
    return row!.id;
  }
}

export class DrizzleAdmissionRepository implements AdmissionRepository {
  constructor(private readonly db: Db) {}

  async findId(patientId: string, hospitalId: string): Promise<string | null> {
    const rows = await this.db
      .select({ id: admissions.id })
      .from(admissions)
      .where(and(eq(admissions.patientId, patientId), eq(admissions.hospitalId, hospitalId)))
      .limit(1);
    return rows[0]?.id ?? null;
  }

  async create(input: {
    patientId: string;
    hospitalId: string;
    status: ExistingPatient["status"];
  }): Promise<string> {
    const [row] = await this.db
      .insert(admissions)
      .values({
        patientId: input.patientId,
        hospitalId: input.hospitalId,
        status: input.status,
        hasPublicNotes: false,
      })
      .returning({ id: admissions.id });
    return row!.id;
  }
}

export class DrizzleSensitiveDataStore implements SensitiveDataStore {
  constructor(private readonly db: Db) {}

  async saveContact(input: {
    patientId: string;
    phone: string | null;
    address: string | null;
  }): Promise<void> {
    await this.db
      .insert(contacts)
      .values({ patientId: input.patientId, phone: input.phone, address: input.address });
  }

  async saveClinicalNote(input: { admissionId: string; text: string }): Promise<void> {
    await this.db
      .insert(clinicalNotes)
      .values({ admissionId: input.admissionId, note: input.text, arrivedWith: null });
  }
}

export class DrizzleRawRowStore implements RawRowStore {
  constructor(private readonly db: Db) {}

  async persistNew(
    rows: ParsedPatientRow[],
    context: { fileId: string; uploadedBy: string | null },
  ): Promise<Set<string>> {
    if (rows.length === 0) return new Set();
    const inserted = await this.db
      .insert(rawRows)
      .values(
        rows.map((r) => ({
          fileId: context.fileId,
          contentHash: r.fingerprint,
          rawRow: r.raw,
          uploadedBy: context.uploadedBy,
        })),
      )
      .onConflictDoNothing({ target: rawRows.contentHash })
      .returning({ hash: rawRows.contentHash });
    return new Set(inserted.map((x) => x.hash));
  }
}

export class DrizzleAuditLog implements AuditLog {
  constructor(private readonly db: Db) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.db.insert(auditLog).values({
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      payload: entry.payload ?? null,
    });
  }
}
