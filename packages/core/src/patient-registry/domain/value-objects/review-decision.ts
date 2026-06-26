// Decisión del moderador sobre un caso dudoso de la cola de revisión.
// - merge:     son la misma persona (se fusionarán; la ejecución va en otra entrega).
// - keep:      son personas distintas, mantener separados.
// - more_info: falta información para decidir.
export type ReviewDecision = "merge" | "keep" | "more_info";

const DECISIONS: readonly ReviewDecision[] = ["merge", "keep", "more_info"];

export function isReviewDecision(value: string): value is ReviewDecision {
  return (DECISIONS as readonly string[]).includes(value);
}
