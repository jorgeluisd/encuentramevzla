import type { DocumentId } from "../value-objects/document-id";
import type { NormalizedPhone } from "../value-objects/normalized-phone";
import type { PersonName } from "../value-objects/person-name";
import { levenshtein, tokenSetSimilarity, trigramSimilarity } from "./string-similarity";

export interface PatientIdentity {
  name: PersonName;
  document: DocumentId | null;
  // Señal media-fuerte de identidad; se compara en memoria (nunca se expone en `public`).
  phone?: NormalizedPhone | null;
  // Señal débil: solo separa homónimos y desempata prioridad; nunca fusiona.
  age?: number | null;
}

export interface MatchCandidate extends PatientIdentity {
  id: string;
  // Hospitales donde el candidato tiene ingreso (para desambiguar homónimos sin cédula).
  hospitalIds?: ReadonlySet<string>;
}

export type MatchDecision =
  | { kind: "merge"; targetId: string }
  | { kind: "conflict" } // misma cédula, persona distinta
  | { kind: "review" } // similitud media: revisión humana
  | { kind: "new" };

const MERGE_BY_NAME = 0.92;
const REVIEW_BY_NAME = 0.8;
const SAME_DOCUMENT_NAME = 0.5;
const DOC_TYPO_DISTANCE = 2; // cédulas que difieren ≤ 2 dígitos: posible typo → revisión
const PHONE_MERGE_NAME = 0.85; // teléfono igual + nombre ≥ esto → misma persona
const AGE_TOLERANCE = 2; // edades que difieren > esto refuerzan "personas distintas"

// Dos cédulas VÁLIDAS y distintas contradicen la identidad (aunque coincida el teléfono).
function validDocsConflict(a: DocumentId | null | undefined, b: DocumentId | null | undefined): boolean {
  return Boolean(a?.isValid && b?.isValid && a.normalized !== b.normalized);
}

// La edad separa homónimos: ambas presentes y lejanas ⇒ personas distintas.
function agesFarApart(a: number | null | undefined, b: number | null | undefined): boolean {
  return a != null && b != null && Math.abs(a - b) > AGE_TOLERANCE;
}

// Combinación trigram + token-set en [0,1].
export function nameSimilarity(a: PersonName, b: PersonName): number {
  return (
    0.5 * trigramSimilarity(a.normalized, b.normalized) +
    0.5 * tokenSetSimilarity(a.tokens, b.tokens)
  );
}

// Candidato más parecido por nombre (para reconstruir la "zona gris" en la cola de revisión).
export function mostSimilarByName(
  name: PersonName,
  candidates: readonly MatchCandidate[],
): { candidate: MatchCandidate; score: number } | null {
  let best: MatchCandidate | null = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    const score = nameSimilarity(name, candidate.name);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best ? { candidate: best, score: bestScore } : null;
}

export function decideMatch(
  incoming: PatientIdentity,
  candidates: readonly MatchCandidate[],
  incomingHospitalId?: string | null,
): MatchDecision {
  const document = incoming.document;
  if (document && document.isValid) {
    const sameDocument = candidates.find(
      (c) => c.document?.isValid && c.document.normalized === document.normalized,
    );
    if (sameDocument) {
      return nameSimilarity(incoming.name, sameDocument.name) >= SAME_DOCUMENT_NAME
        ? { kind: "merge", targetId: sameDocument.id }
        : { kind: "conflict" };
    }
  }

  // Señal fuerte sin cédula concluyente: mismo teléfono + nombre alto ⇒ misma persona
  // (incluye traslados entre hospitales). No aplica si dos cédulas válidas se contradicen.
  const incomingPhone = incoming.phone;
  if (incomingPhone && incomingPhone.isValid) {
    const byPhone = candidates.find(
      (c) =>
        c.phone?.isValid &&
        incomingPhone.equals(c.phone) &&
        nameSimilarity(incoming.name, c.name) >= PHONE_MERGE_NAME &&
        !validDocsConflict(document, c.document),
    );
    if (byPhone) return { kind: "merge", targetId: byPhone.id };
  }

  let best: MatchCandidate | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = nameSimilarity(incoming.name, candidate.name);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  if (best && bestScore >= MERGE_BY_NAME) {
    const bestDoc = best.document;
    // Ambos con cédula válida pero DISTINTA: pocos dígitos = posible typo → revisión;
    // muy distintas = persona distinta → no fusionar.
    if (validDocsConflict(document, bestDoc)) {
      return levenshtein(document!.normalized, bestDoc!.normalized) <= DOC_TYPO_DISTANCE
        ? { kind: "review" }
        : { kind: "new" };
    }
    // Sin señal fuerte (ninguna cédula válida y el teléfono no fusionó): el nombre NO decide
    // solo (ADR-0004).
    if (!document?.isValid && !bestDoc?.isValid) {
      // Edad lejana → homónimos → separados (ni siquiera revisión).
      if (agesFarApart(incoming.age, best.age)) return { kind: "new" };
      // Hospital distinto conocido → homónimos en hospitales distintos → separados
      // (la búsqueda igual muestra ambas coincidencias).
      if (
        incomingHospitalId &&
        best.hospitalIds &&
        best.hospitalIds.size > 0 &&
        !best.hospitalIds.has(incomingHospitalId)
      ) {
        return { kind: "new" };
      }
      // Mismo hospital (o desconocido) sin señal fuerte → revisión humana, no auto-merge.
      return { kind: "review" };
    }
    // Al menos una cédula válida y sin conflicto → completa la identidad → misma persona.
    return { kind: "merge", targetId: best.id };
  }
  if (best && bestScore >= REVIEW_BY_NAME) return { kind: "review" };
  return { kind: "new" };
}
