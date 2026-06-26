import type { PatientStatus } from "../value-objects/patient-status";

// Atributos relevantes de cada lado de la fusión.
export interface MergeSide {
  documentNormalized: string | null;
  documentValid: boolean;
  isMinor: boolean;
  status: PatientStatus;
}

// Cambios a aplicar SOBRE el target (canónico). Solo completa/eleva; nunca pierde dato.
export interface MergeChanges {
  documentNormalized?: string;
  isMinor?: boolean;
  status?: PatientStatus;
}

export function mergedFields(target: MergeSide, source: MergeSide): MergeChanges {
  const changes: MergeChanges = {};

  // Completar cédula solo si el target no tiene una válida y el source sí.
  if (!target.documentValid && source.documentValid && source.documentNormalized) {
    changes.documentNormalized = source.documentNormalized;
  }
  // Elevar a menor si el source lo es.
  if (source.isMinor && !target.isMinor) changes.isMinor = true;
  // Elevar a fallecido (estado más sensible) si el source lo está.
  if (source.status === "deceased" && target.status !== "deceased") {
    changes.status = "deceased";
  }

  return changes;
}
