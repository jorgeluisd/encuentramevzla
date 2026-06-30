import type { DocumentId } from "../../domain/value-objects/document-id";
import type { PersonName } from "../../domain/value-objects/person-name";
import type { PatientStatus } from "../../domain/value-objects/patient-status";

// Estado actual mínimo del paciente para validar scope y reanclar la nota.
export interface EditablePatient {
  patientId: string;
  hospitalIds: Set<string>; // hospitales con ingreso (scope: el actor acotado debe estar en uno)
  clinicalNotes: string | null; // nota actual (la nueva se re-evalúa con looksDeceased)
  admissionId: string | null; // ingreso al que anclar la nota editada
}

// Cambios ya calculados (value objects del dominio) listos para persistir.
export interface PatientEditChanges {
  name: PersonName;
  document: DocumentId | null;
  age: number | null;
  isMinor: boolean;
  status: PatientStatus;
  phone: string | null;
  address: string | null;
  clinicalNotes: string | null;
  admissionId: string | null;
}

export interface PatientEditSave {
  patientId: string;
  actorId: string | null;
  changes: PatientEditChanges;
}

// Port de edición: carga el estado actual y persiste los cambios (con audit) atómicamente.
export interface PatientEditor {
  load(patientId: string): Promise<EditablePatient | null>;
  save(input: PatientEditSave): Promise<void>;
}
