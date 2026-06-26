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

export interface PatientUpdate {
  document?: DocumentId;
  isMinor?: boolean;
  status?: PatientStatus;
}

export interface PatientRepository {
  loadAll(): Promise<ExistingPatient[]>;
  create(patient: NewPatient): Promise<string>;
  update(id: string, changes: PatientUpdate): Promise<void>;
}

export interface HospitalRepository {
  resolveByName(name: string): Promise<string>; // crea si no existe
}

export interface AdmissionRepository {
  findId(patientId: string, hospitalId: string): Promise<string | null>;
  create(input: { patientId: string; hospitalId: string; status: PatientStatus }): Promise<string>;
}

export interface SensitiveDataStore {
  saveContact(input: { patientId: string; phone: string | null; address: string | null }): Promise<void>;
  saveClinicalNote(input: { admissionId: string; text: string }): Promise<void>;
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
}
