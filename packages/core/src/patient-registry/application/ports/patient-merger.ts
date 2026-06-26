// Port: ejecuta la fusión de dos pacientes de forma transaccional (lo implementa la
// infraestructura). El target (canónico) sobrevive; el source se elimina (hard delete).
export interface PatientMerger {
  merge(input: {
    targetId: string;
    sourceId: string;
    actorId: string | null;
  }): Promise<void>;
}
