import type { PatientMerger } from "../ports/patient-merger";

export interface MergePatientsInput {
  targetId: string;
  sourceId: string;
  actorId: string | null;
}

/**
 * Fusiona el paciente duplicado (source) en el canónico (target). La mecánica
 * transaccional (re-apuntar ingresos/sensibles, reconciliar campos, borrar el source)
 * vive en el adapter; aquí solo se valida y se delega.
 */
export class MergePatients {
  constructor(private readonly merger: PatientMerger) {}

  async execute(input: MergePatientsInput): Promise<void> {
    if (input.targetId === input.sourceId) {
      throw new Error("No se puede fusionar un paciente consigo mismo.");
    }
    await this.merger.merge(input);
  }
}
