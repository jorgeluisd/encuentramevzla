import { nameSimilarity } from "../../../patient-registry/domain/services/patient-matching";
import type { PersonName } from "../../../patient-registry/domain/value-objects/person-name";
import { cedulaMatchKey } from "./cedula-cell";

// Umbrales (ADR-0008; reusan los del dominio, patient-matching.ts):
const IDENTICAL = 0.92; // MERGE_BY_NAME → misma persona si además no hay conflicto de campos
const REVIEW = 0.8; // REVIEW_BY_NAME → banda de conflicto/revisión
const CANDIDATE_FLOOR = 0.72; // por debajo ⇒ no hay candidato ⇒ ONLY_IN_SOURCE
const AGE_TOLERANCE = 2; // |Δedad| > esto ⇒ conflicto de edad

// Categorías por-registro que decide el motor (staging vs prod). ONLY_IN_PRODUCTION y
// DUP_IN_SOURCE son agregados que arma el caso de uso, no una decisión por registro.
export type SourceCategory = "ONLY_IN_SOURCE" | "MATCH_IDENTICAL" | "MATCH_CONFLICT";

export interface ReconciliationIdentity {
  name: PersonName;
  doc: string | null; // cédula normalizada prod-compatible (o null)
  age: number | null;
  sex: string | null; // 'M' | 'F' | null (normalizado)
  center: string; // centro canónico
}

export interface ProductionCandidate extends ReconciliationIdentity {
  id: string;
}

// Valores serializables (JSON): cédula/sexo/centro/nombre = string, edad = number.
export type ConflictValue = string | number | null;
export type ConflictingFields = Record<string, { source: ConflictValue; production: ConflictValue }>;

export interface Categorization {
  category: SourceCategory;
  productionRecordId: string | null;
  score: number | null; // similitud de nombre [0,1], 3 decimales
  conflictingFields: ConflictingFields | null;
  needsReview: boolean;
}

export function categorize(
  source: ReconciliationIdentity,
  candidates: readonly ProductionCandidate[],
): Categorization {
  if (candidates.length === 0) {
    return onlyInSource(null);
  }

  let best: ProductionCandidate | null = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    const score = nameSimilarity(source.name, candidate.name);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  // (1) Refuerzo por cédula: misma cédula normalizada en ambos lados.
  const sourceKey = cedulaMatchKey(source.doc);
  const docTwin = sourceKey
    ? (candidates.find((c) => cedulaMatchKey(c.doc) === sourceKey) ?? null)
    : null;
  if (docTwin) {
    const score = nameSimilarity(source.name, docTwin.name);
    const conflicts = compareFields(source, docTwin);
    // Cédula igual + nombres DIVERGENTES = señal de alerta, no match automático → revisión.
    if (score < REVIEW) {
      return {
        category: "MATCH_CONFLICT",
        productionRecordId: docTwin.id,
        score: round(score),
        conflictingFields: {
          ...conflicts,
          nombre: { source: source.name.normalized, production: docTwin.name.normalized },
        },
        needsReview: true,
      };
    }
    return decideWithFields("matched", docTwin.id, score, conflicts);
  }

  // (2) Por nombre.
  if (best && bestScore >= IDENTICAL) {
    return decideWithFields("matched", best.id, bestScore, compareFields(source, best));
  }
  if (best && bestScore >= CANDIDATE_FLOOR) {
    // Candidato de confianza media/débil: no es idéntico ni claramente "solo en Excel" → revisión.
    const conflicts = compareFields(source, best);
    return {
      category: "MATCH_CONFLICT",
      productionRecordId: best.id,
      score: round(bestScore),
      conflictingFields: Object.keys(conflicts).length ? conflicts : null,
      needsReview: true,
    };
  }
  return onlyInSource(best ? round(bestScore) : null);
}

function decideWithFields(
  _mode: "matched",
  productionRecordId: string,
  score: number,
  conflicts: ConflictingFields,
): Categorization {
  if (Object.keys(conflicts).length === 0) {
    return {
      category: "MATCH_IDENTICAL",
      productionRecordId,
      score: round(score),
      conflictingFields: null,
      needsReview: false,
    };
  }
  return {
    category: "MATCH_CONFLICT",
    productionRecordId,
    score: round(score),
    conflictingFields: conflicts,
    needsReview: true,
  };
}

function onlyInSource(score: number | null): Categorization {
  return {
    category: "ONLY_IN_SOURCE",
    productionRecordId: null,
    score,
    conflictingFields: null,
    needsReview: false,
  };
}

// Discrepancias en campos comparables: cédula, edad (±2), sexo, centro.
function compareFields(
  source: ReconciliationIdentity,
  candidate: ReconciliationIdentity,
): ConflictingFields {
  const conflicts: ConflictingFields = {};

  const a = cedulaMatchKey(source.doc);
  const b = cedulaMatchKey(candidate.doc);
  if (a && b && a !== b) conflicts["cedula"] = { source: a, production: b };

  if (
    source.age != null &&
    candidate.age != null &&
    Math.abs(source.age - candidate.age) > AGE_TOLERANCE
  ) {
    conflicts["edad"] = { source: source.age, production: candidate.age };
  }

  if (source.sex && candidate.sex && source.sex !== candidate.sex) {
    conflicts["sexo"] = { source: source.sex, production: candidate.sex };
  }

  if (source.center && candidate.center && source.center !== candidate.center) {
    conflicts["centro"] = { source: source.center, production: candidate.center };
  }

  return conflicts;
}

function round(score: number): number {
  return Math.round(score * 1000) / 1000;
}
