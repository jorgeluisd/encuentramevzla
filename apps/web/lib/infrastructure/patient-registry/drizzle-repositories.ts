import { arrayOverlaps, eq, inArray, or, sql } from "drizzle-orm";
import {
  admissions,
  auditLog,
  clinicalNotes,
  contacts,
  hospitalAliases,
  hospitals,
  patients,
  rawRows,
} from "@evzla/db";
import type { getDb } from "@evzla/db/client";
import {
  DocumentId,
  matchHospital,
  normalizeHospitalName,
  NormalizedPhone,
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
        age: patients.age,
        isMinor: patients.isMinor,
        status: patients.status,
      })
      .from(patients)
      .where(conds.length === 1 ? conds[0] : or(...conds));
    if (rows.length === 0) return [];

    // Teléfono como señal de identidad: se lee del schema `sensitive` SOLO en este camino
    // de ingesta (servidor de confianza, dentro de la tx), se compara en memoria y NUNCA
    // se persiste ni se expone en `public` (evita enumeración). Ver spec 0020 §8.
    const ids = rows.map((r) => r.id);
    const phoneRows = await this.db
      .select({ patientId: contacts.patientId, phone: contacts.phone })
      .from(contacts)
      .where(inArray(contacts.patientId, ids));
    const phoneByPatient = new Map<string, string>();
    for (const p of phoneRows) {
      if (p.phone && !phoneByPatient.has(p.patientId)) phoneByPatient.set(p.patientId, p.phone);
    }

    return rows.map((r) => {
      const rawPhone = phoneByPatient.get(r.id);
      return {
        id: r.id,
        name: PersonName.fromRaw(r.name),
        document: r.document ? DocumentId.fromRaw(r.document) : null,
        phone: rawPhone ? NormalizedPhone.fromRaw(rawPhone) : null,
        age: r.age,
        isMinor: r.isMinor,
        status: r.status,
      };
    });
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
        age: u.changes.age ?? null,
      }))
      .filter((r) => r.doc !== null || r.isMinor !== null || r.status !== null || r.age !== null);
    if (rows.length === 0) return;
    for (const part of chunk(rows, BATCH)) {
      const values = sql.join(
        part.map(
          (r) =>
            sql`(${r.id}::uuid, ${r.doc}::text, ${r.isMinor}::boolean, ${r.status}::public.person_status, ${r.age}::integer)`,
        ),
        sql`, `,
      );
      await this.db.execute(sql`
        UPDATE public.patients AS p SET
          normalized_doc_number = COALESCE(v.doc, p.normalized_doc_number),
          is_minor = COALESCE(v.is_minor, p.is_minor),
          status = COALESCE(v.status, p.status),
          age = COALESCE(v.age, p.age)
        FROM (VALUES ${values}) AS v(id, doc, is_minor, status, age)
        WHERE p.id = v.id
      `);
    }
  }
}

export class DrizzleHospitalRepository implements HospitalRepository {
  constructor(private readonly db: DbOrTx) {}

  // Catálogo canónico (spec 0020, ADR-0005): alias exacto → fuzzy (trigram) → nuevo
  // provisional. Converge variantes de nombre a un único hospital sin duplicar.
  async resolveByName(name: string): Promise<string> {
    const norm = normalizeHospitalName(name);
    const existing = await this.resolveExisting(name);
    if (existing) {
      if (norm !== "") await this.recordAlias(norm, existing);
      return existing;
    }
    // Hospital nuevo → provisional + alias, para revisión del moderador.
    const id = await this.createProvisional(name);
    if (norm !== "") await this.recordAlias(norm, id);
    return id;
  }

  // Igual que resolveByName pero NO crea: null si el hospital no está en el catálogo.
  // Se usa en carga scoped para verificar pertenencia sin ensuciar el catálogo (ADR-0006).
  async resolveExisting(name: string): Promise<string | null> {
    const norm = normalizeHospitalName(name);
    if (norm === "") {
      const [existing] = await this.db
        .select({ id: hospitals.id })
        .from(hospitals)
        .where(sql`lower(${hospitals.name}) = lower(${name})`)
        .limit(1);
      return existing?.id ?? null;
    }
    const [alias] = await this.db
      .select({ id: hospitalAliases.hospitalId })
      .from(hospitalAliases)
      .where(eq(hospitalAliases.aliasNormalized, norm))
      .limit(1);
    if (alias) return alias.id;
    const all = await this.db.select({ id: hospitals.id, name: hospitals.name }).from(hospitals);
    return matchHospital(
      norm,
      all.map((h) => ({ id: h.id, normalized: normalizeHospitalName(h.name) })),
    );
  }

  private async createProvisional(name: string): Promise<string> {
    const [row] = await this.db
      .insert(hospitals)
      .values({ name, provisional: true })
      .returning({ id: hospitals.id });
    return row!.id;
  }

  private async recordAlias(aliasNormalized: string, hospitalId: string): Promise<void> {
    await this.db
      .insert(hospitalAliases)
      .values({ aliasNormalized, hospitalId })
      .onConflictDoNothing({ target: hospitalAliases.aliasNormalized });
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
