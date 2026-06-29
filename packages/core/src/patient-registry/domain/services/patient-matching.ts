import type { DocumentId } from "../value-objects/document-id";
import type { PersonName } from "../value-objects/person-name";
import { levenshtein, tokenSetSimilarity, trigramSimilarity } from "./string-similarity";

export interface PatientIdentity {
  name: PersonName;
  document: DocumentId | null;
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
    if (document?.isValid && bestDoc?.isValid && bestDoc.normalized !== document.normalized) {
      return levenshtein(document.normalized, bestDoc.normalized) <= DOC_TYPO_DISTANCE
        ? { kind: "review" }
        : { kind: "new" };
    }
    // Ninguno aporta cédula que distinga: desambiguar por hospital. Si sabemos ambos
    // hospitales y el del registro NO está entre los del candidato → posibles homónimos
    // en hospitales distintos → no fusionar (la búsqueda igual muestra ambas coincidencias).
    if (
      !document?.isValid &&
      !bestDoc?.isValid &&
      incomingHospitalId &&
      best.hospitalIds &&
      best.hospitalIds.size > 0 &&
      !best.hospitalIds.has(incomingHospitalId)
    ) {
      return { kind: "new" };
    }
    return { kind: "merge", targetId: best.id };
  }
  if (best && bestScore >= REVIEW_BY_NAME) return { kind: "review" };
  return { kind: "new" };
}
