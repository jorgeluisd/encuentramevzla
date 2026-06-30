import type { PatientStatus } from "../../domain/value-objects/patient-status";

// Fila de exportación: público + sensible, ya UNIDA y ACOTADA al hospital por el adapter.
// Es el inverso del parser de ingesta (mismos campos canónicos), para round-trip limpio.
export interface ExportRow {
  hospitalName: string;
  fullName: string | null;
  age: number | null;
  documentNumber: string | null;
  status: PatientStatus;
  isMinor: boolean;
  phone: string | null;
  address: string | null;
  clinicalNotes: string | null;
}

// Port de LECTURA del export. La implementación (Drizzle/service_role) DEBE filtrar por
// hospitalId; el caso de uso, además, valida el scope del actor (defensa en profundidad).
export interface HospitalPatientExportReader {
  loadForHospital(hospitalId: string): Promise<ExportRow[]>;
}
