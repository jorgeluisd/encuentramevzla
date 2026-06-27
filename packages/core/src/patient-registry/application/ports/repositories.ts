import type { MatchCandidate } from "../../domain/services/patient-matching";
import type { DocumentId } from "../../domain/value-objects/document-id";
import type { PersonName } from "../../domain/value-objects/person-name";
import type { PatientStatus } from "../../domain/value-objects/patient-status";
import type { ParsedPatientRow } from "./patient-list-parser";

export interface ExistingPatient extends MatchCandidate {
  isMinor: boolean;
  status: PatientStatus;
}

export interface NewPatient {
  name: PersonName;
  document: DocumentId | null;
  age: number | null;
  isMinor: boolean;
  status: PatientStatus;
}

// IDs generados en memoria (newId) para armar el grafo antes de tocar la DB.
export interface NewPatientRow extends NewPatient {
  id: string;
}

export interface PatientUpdate {
  document?: DocumentId;
  isMinor?: boolean;
  status?: PatientStatus;
}

export interface PatientUpdateRow {
  id: string;
  changes: PatientUpdate;
}

export interface NewAdmissionRow {
  id: string;
  patientId: string;
  hospitalId: string;
  status: PatientStatus;
}

export interface NewContactRow {
  patientId: string;
  phone: string | null;
  address: string | null;
}

export interface NewClinicalNoteRow {
  admissionId: string;
  text: string;
}

export interface PatientRepository {
  loadAll(): Promise<ExistingPatient[]>;
  createMany(rows: NewPatientRow[]): Promise<void>;
  updateMany(updates: PatientUpdateRow[]): Promise<void>;
}

export interface HospitalRepository {
  resolveByName(name: string): Promise<string>; // crea si no existe
}

export interface AdmissionRepository {
  // Mapa `patientId|hospitalId` → admissionId de TODAS las admisiones (una lectura, no N findId).
  loadExistingIds(): Promise<Map<string, string>>;
  createMany(rows: NewAdmissionRow[]): Promise<void>;
}

export interface SensitiveDataStore {
  saveContacts(rows: NewContactRow[]): Promise<void>;
  saveClinicalNotes(rows: NewClinicalNoteRow[]): Promise<void>;
}

export interface RawRowStore {
  // Inserta crudas idempotentemente; devuelve los fingerprints nuevos.
  persistNew(
    rows: ParsedPatientRow[],
    context: { fileId: string; uploadedBy: string | null },
  ): Promise<Set<string>>;
}

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  payload?: unknown;
}

export interface AuditLog {
  record(entry: AuditEntry): Promise<void>;
  recordMany(entries: AuditEntry[]): Promise<void>;
}

// Repos enlazados a una misma transacción (atomicidad por archivo).
export interface IngestionRepositories {
  rawRows: RawRowStore;
  patients: PatientRepository;
  hospitals: HospitalRepository;
  admissions: AdmissionRepository;
  sensitive: SensitiveDataStore;
  audit: AuditLog;
}

// Unidad de trabajo: ejecuta `work` con repos atados a una transacción y commitea
// (o hace rollback completo si lanza). Es el límite de atomicidad de la ingesta.
export interface IngestionUnitOfWork {
  runAtomic<T>(work: (repos: IngestionRepositories) => Promise<T>): Promise<T>;
}
