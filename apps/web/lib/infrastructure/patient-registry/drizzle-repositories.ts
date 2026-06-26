import { and, eq } from "drizzle-orm";
import {
  auditLog,
  contacto,
  hospitales,
  ingresos,
  observacionesClinicas,
  personas,
  stagingFilas,
} from "@registro/db";
import type { getDb } from "@registro/db/client";
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
import { statusFromDb, statusToDb } from "./status-mapping";

type Db = ReturnType<typeof getDb>;

export class DrizzlePatientRepository implements PatientRepository {
  constructor(private readonly db: Db) {}

  async loadAll(): Promise<ExistingPatient[]> {
    const rows = await this.db
      .select({
        id: personas.id,
        name: personas.nombreNormalizado,
        document: personas.docNumeroNormalizado,
        isMinor: personas.esMenor,
        status: personas.estado,
      })
      .from(personas);
    return rows.map((r) => ({
      id: r.id,
      name: PersonName.fromRaw(r.name),
      document: r.document ? DocumentId.fromRaw(r.document) : null,
      isMinor: r.isMinor,
      status: statusFromDb(String(r.status)),
    }));
  }

  async create(patient: NewPatient): Promise<string> {
    const [row] = await this.db
      .insert(personas)
      .values({
        nombreNormalizado: patient.name.normalized,
        tokensNombre: [...patient.name.tokens],
        edad: patient.age,
        docNumeroNormalizado:
          patient.document && patient.document.isValid ? patient.document.normalized : null,
        estado: statusToDb(patient.status),
        esMenor: patient.isMinor,
      })
      .returning({ id: personas.id });
    return row!.id;
  }

  async update(id: string, changes: PatientUpdate): Promise<void> {
    const values: Partial<typeof personas.$inferInsert> = {};
    if (changes.document) values.docNumeroNormalizado = changes.document.normalized;
    if (changes.isMinor !== undefined) values.esMenor = changes.isMinor;
    if (changes.status) values.estado = statusToDb(changes.status);
    if (Object.keys(values).length > 0) {
      await this.db.update(personas).set(values).where(eq(personas.id, id));
    }
  }
}

export class DrizzleHospitalRepository implements HospitalRepository {
  constructor(private readonly db: Db) {}

  async resolveByName(name: string): Promise<string> {
    const existing = await this.db
      .select({ id: hospitales.id })
      .from(hospitales)
      .where(eq(hospitales.nombre, name))
      .limit(1);
    if (existing[0]) return existing[0].id;
    const [row] = await this.db
      .insert(hospitales)
      .values({ nombre: name })
      .returning({ id: hospitales.id });
    return row!.id;
  }
}

export class DrizzleAdmissionRepository implements AdmissionRepository {
  constructor(private readonly db: Db) {}

  async findId(patientId: string, hospitalId: string): Promise<string | null> {
    const rows = await this.db
      .select({ id: ingresos.id })
      .from(ingresos)
      .where(and(eq(ingresos.personaId, patientId), eq(ingresos.hospitalId, hospitalId)))
      .limit(1);
    return rows[0]?.id ?? null;
  }

  async create(input: {
    patientId: string;
    hospitalId: string;
    status: ExistingPatient["status"];
  }): Promise<string> {
    const [row] = await this.db
      .insert(ingresos)
      .values({
        personaId: input.patientId,
        hospitalId: input.hospitalId,
        estado: statusToDb(input.status),
        observacionesPublicasFlag: false,
      })
      .returning({ id: ingresos.id });
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
      .insert(contacto)
      .values({ personaId: input.patientId, telefono: input.phone, direccion: input.address });
  }

  async saveClinicalNote(input: { admissionId: string; text: string }): Promise<void> {
    await this.db
      .insert(observacionesClinicas)
      .values({ ingresoId: input.admissionId, texto: input.text, llegoCon: null });
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
      .insert(stagingFilas)
      .values(
        rows.map((r) => ({
          archivoId: context.fileId,
          contentHash: r.fingerprint,
          filaCruda: r.raw,
          subidoPor: context.uploadedBy,
        })),
      )
      .onConflictDoNothing({ target: stagingFilas.contentHash })
      .returning({ hash: stagingFilas.contentHash });
    return new Set(inserted.map((x) => x.hash));
  }
}

export class DrizzleAuditLog implements AuditLog {
  constructor(private readonly db: Db) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.db.insert(auditLog).values({
      actorId: entry.actorId,
      accion: entry.action,
      entidad: entry.entity,
      entidadId: entry.entityId,
      payload: entry.payload ?? null,
    });
  }
}
