import { isReviewDecision } from "../../domain/value-objects/review-decision";
import type { AuditLog } from "../ports/repositories";

export interface ResolveReviewInput {
  patientId: string;
  decision: string;
  candidateId?: string | null;
  actorId: string | null;
}

/**
 * Registra la decisión del moderador sobre un caso dudoso (triage). NO ejecuta la
 * fusión todavía: solo deja el rastro `review_resolved` (append-only), que saca el
 * caso de la cola.
 */
export class ResolveReviewCase {
  constructor(private readonly audit: AuditLog) {}

  async execute(input: ResolveReviewInput): Promise<void> {
    if (!isReviewDecision(input.decision)) {
      throw new Error(`Decisión inválida: ${input.decision}`);
    }
    await this.audit.record({
      actorId: input.actorId,
      action: "review_resolved",
      entity: "patient",
      entityId: input.patientId,
      payload: { decision: input.decision, candidateId: input.candidateId ?? null },
    });
  }
}
