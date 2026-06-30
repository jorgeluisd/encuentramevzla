import type { Role } from "../../domain/value-objects/team-role";
import type {
  ExportRow,
  HospitalPatientExportReader,
} from "../ports/hospital-patient-export-reader";

// Actor de la exportación: su rol y su hospital (null = global). Valida el scope.
export interface ExportActor {
  role: Role;
  hospitalId: string | null;
}

// Un miembro acotado intentó exportar un hospital que no es el suyo.
export class CrossHospitalExportError extends Error {
  constructor() {
    super("forbidden: cross-hospital export");
    this.name = "CrossHospitalExportError";
  }
}

// Caso de uso: lee las filas canónicas de un hospital (público + sensible, scoped).
// No genera el .xlsx (eso es infra de presentación); solo entrega las filas.
export class ExportHospitalPatients {
  constructor(private readonly reader: HospitalPatientExportReader) {}

  async execute(input: { actor: ExportActor; hospitalId: string }): Promise<ExportRow[]> {
    // Scoping server-side (D6): un miembro acotado SOLO exporta su propio hospital.
    // El global (hospitalId null) puede exportar cualquiera.
    if (input.actor.hospitalId !== null && input.actor.hospitalId !== input.hospitalId) {
      throw new CrossHospitalExportError();
    }
    return this.reader.loadForHospital(input.hospitalId);
  }
}
