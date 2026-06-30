import { arrayOverlaps, eq, inArray, or, sql } from "drizzle-orm";
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
  type CandidateKeys,
  type ExistingPatient,
  type HospitalRepository,
  type IngestionRepositories,
  type IngestionUnitOfWork,
  type NewAdmissionRow,
  type NewClinicalNoteRow,
  type NewContactRow,
  type NewPatientRow,
  type ParsedPatientRow,
  type PatientRepository,
  type PatientUpdateRow,
  type RawRowStore,
  type SensitiveDataStore,
} from "@evzla/core";

type Db = ReturnType<typeof getDb>;
// Transacción Drizzle: comparte el query builder con la conexión raíz.
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type DbOrTx = Db | Tx;

// Lote seguro de filas por INSERT (límite de parámetros del driver).
const BATCH = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export class DrizzlePatientRepository implements PatientRepository {
  constructor(private readonly db: DbOrTx) {}

  async loadCandidates(keys: CandidateKeys): Promise<ExistingPatient[]> {
    // Solo candidatos plausibles del lote: misma cédula O ≥1 token de nombre en común.
    const conds = [];
    if (keys.documents.length > 0)
      conds.push(inArray(patients.normalizedDocNumber, keys.documents));
    if (keys.tokens.length > 0)
      conds.push(arrayOverlaps(patients.nameTokens, keys.tokens));
    if (conds.length === 0) return [];
    const rows = await this.db
      .select({
        id: patients.id,
        name: patients.normalizedName,
        document: patients.normalizedDocNumber,
        isMinor: patients.isMinor,
        status: patients.status,
      })
      .from(patients)
      .where(conds.length === 1 ? conds[0] : or(...conds));
    return rows.map((r) => ({
      id: r.id,
      name: PersonName.fromRaw(r.name),
      document: r.document ? DocumentId.fromRaw(r.document) : null,
      isMinor: r.isMinor,
      status: r.status,
    }));
  }

  async createMany(rows: NewPatientRow[]): Promise<void> {
    for (const part of chunk(rows, BATCH)) {
      await this.db.insert(patients).values(
        part.map((p) => ({
          id: p.id,
          normalizedName: p.name.normalized,
          nameTokens: [...p.name.tokens],
          age: p.age,
          normalizedDocNumber:
            p.document && p.document.isValid ? p.document.normalized : null,
          status: p.status,
          isMinor: p.isMinor,
        })),
      );
    }
  }

  async updateMany(updates: PatientUpdateRow[]): Promise<void> {
    // Un solo UPDATE ... FROM (VALUES ...) por lote (anti-N+1). Los campos no
    // cambiados van NULL y COALESCE conserva el valor existente.
    const rows = updates
      .map((u) => ({
        id: u.id,
        doc: u.changes.document ? u.changes.document.normalized : null,
        isMinor: u.changes.isMinor ?? null,
        status: u.changes.status ?? null,
      }))
      .filter((r) => r.doc !== null || r.isMinor !== null || r.status !== null);
    if (rows.length === 0) return;
    for (const part of chunk(rows, BATCH)) {
      const values = sql.join(
        part.map(
          (r) =>
            sql`(${r.id}::uuid, ${r.doc}::text, ${r.isMinor}::boolean, ${r.status}::public.person_status)`,
        ),
        sql`, `,
      );
      await this.db.execute(sql`
        UPDATE public.patients AS p SET
          normalized_doc_number = COALESCE(v.doc, p.normalized_doc_number),
          is_minor = COALESCE(v.is_minor, p.is_minor),
          status = COALESCE(v.status, p.status)
        FROM (VALUES ${values}) AS v(id, doc, is_minor, status)
        WHERE p.id = v.id
      `);
    }
  }
}

export class DrizzleHospitalRepository implements HospitalRepository {
  constructor(private readonly db: DbOrTx) {}

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
  constructor(private readonly db: DbOrTx) {}

  async loadExistingIds(patientIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (patientIds.length === 0) return map;
    const rows = await this.db
      .select({
        id: admissions.id,
        patientId: admissions.patientId,
        hospitalId: admissions.hospitalId,
      })
      .from(admissions)
      .where(inArray(admissions.patientId, patientIds));
    for (const r of rows) map.set(`${r.patientId}|${r.hospitalId}`, r.id);
    return map;
  }

  async createMany(rows: NewAdmissionRow[]): Promise<void> {
    for (const part of chunk(rows, BATCH)) {
      await this.db.insert(admissions).values(
        part.map((a) => ({
          id: a.id,
          patientId: a.patientId,
          hospitalId: a.hospitalId,
          status: a.status,
          hasPublicNotes: false,
        })),
      );
    }
  }
}

export class DrizzleSensitiveDataStore implements SensitiveDataStore {
  constructor(private readonly db: DbOrTx) {}

  async saveContacts(rows: NewContactRow[]): Promise<void> {
    for (const part of chunk(rows, BATCH)) {
      await this.db
        .insert(contacts)
        .values(part.map((c) => ({ patientId: c.patientId, phone: c.phone, address: c.address })));
    }
  }

  async saveClinicalNotes(rows: NewClinicalNoteRow[]): Promise<void> {
    for (const part of chunk(rows, BATCH)) {
      await this.db
        .insert(clinicalNotes)
        .values(part.map((n) => ({ admissionId: n.admissionId, note: n.text, arrivedWith: null })));
    }
  }
}

export class DrizzleRawRowStore implements RawRowStore {
  constructor(private readonly db: DbOrTx) {}

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
  constructor(private readonly db: DbOrTx) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.recordMany([entry]);
  }

  async recordMany(entries: AuditEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.db.insert(auditLog).values(
      entries.map((entry) => ({
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        payload: entry.payload ?? null,
      })),
    );
  }
}

// Unidad de trabajo: una transacción que envuelve toda la persistencia de un
// archivo (raw_rows + pacientes + admisiones + sensibles + audit). Si algo
// lanza, rollback completo y el archivo queda reprocesable (idempotencia).
export class DrizzleIngestionUnitOfWork implements IngestionUnitOfWork {
  constructor(private readonly db: Db) {}

  async runAtomic<T>(work: (repos: IngestionRepositories) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      const repos: IngestionRepositories = {
        rawRows: new DrizzleRawRowStore(tx),
        patients: new DrizzlePatientRepository(tx),
        hospitals: new DrizzleHospitalRepository(tx),
        admissions: new DrizzleAdmissionRepository(tx),
        sensitive: new DrizzleSensitiveDataStore(tx),
        audit: new DrizzleAuditLog(tx),
      };
      return work(repos);
    });
  }
}
