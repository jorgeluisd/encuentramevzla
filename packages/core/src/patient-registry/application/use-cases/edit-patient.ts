import { DocumentId } from "../../domain/value-objects/document-id";
import { PersonName } from "../../domain/value-objects/person-name";
import {
  isMinorAge,
  looksDeceased,
  type PatientStatus,
} from "../../domain/value-objects/patient-status";
import type { Role } from "../../domain/value-objects/team-role";
import type { PatientEditor } from "../ports/patient-editor";

export class PatientNotFoundError extends Error {
  constructor() {
    super("patient not found");
    this.name = "PatientNotFoundError";
  }
}

export class CrossHospitalEditError extends Error {
  constructor() {
    super("forbidden: cross-hospital edit");
    this.name = "CrossHospitalEditError";
  }
}

export class InvalidPatientError extends Error {
  constructor() {
    super("invalid patient: name or document required");
    this.name = "InvalidPatientError";
  }
}

export interface EditPatientFields {
  fullName: string | null;
  age: number | null;
  documentNumber: string | null;
  phone: string | null;
  address: string | null;
  clinicalNotes: string | null;
  status: PatientStatus; // selector explícito (D8)
  deceased: boolean; // toggle "¿falleció?" (red primaria)
}

// Caso de uso: edita (no borra) un paciente propio. Recalcula value objects, re-evalúa el
// fallecimiento sobre la nota nueva, valida scope y nombre||cédula (D9), y persiste con audit.
export class EditPatient {
  constructor(private readonly editor: PatientEditor) {}

  async execute(input: {
    actor: { role: Role; hospitalId: string | null };
    actorId: string | null;
    patientId: string;
    fields: EditPatientFields;
  }): Promise<void> {
    const current = await this.editor.load(input.patientId);
    if (!current) throw new PatientNotFoundError();

    // Scope (D11): un miembro acotado solo edita pacientes de su hospital; el global, cualquiera.
    if (
      input.actor.hospitalId !== null &&
      !current.hospitalIds.has(input.actor.hospitalId)
    ) {
      throw new CrossHospitalEditError();
    }

    const name = PersonName.fromRaw(input.fields.fullName ?? "");
    const document = input.fields.documentNumber
      ? DocumentId.fromRaw(input.fields.documentNumber)
      : null;
    // Validez (D9): al menos nombre o cédula válida.
    if (name.isEmpty && !document?.isValid) throw new InvalidPatientError();

    const isMinor = isMinorAge(input.fields.age) || name.flaggedMinor;
    // Fallecimiento: toggle explícito, marcador en el nombre o señal en la nota nueva.
    const deceased =
      input.fields.deceased === true ||
      name.flaggedDeceased ||
      looksDeceased(input.fields.clinicalNotes);
    const status: PatientStatus = deceased ? "deceased" : input.fields.status;

    await this.editor.save({
      patientId: input.patientId,
      actorId: input.actorId,
      changes: {
        name,
        document,
        age: input.fields.age,
        isMinor,
        status,
        phone: input.fields.phone,
        address: input.fields.address,
        clinicalNotes: input.fields.clinicalNotes,
        admissionId: current.admissionId,
      },
    });
  }
}
