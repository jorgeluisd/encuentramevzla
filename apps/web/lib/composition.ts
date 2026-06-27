import "server-only";

import {
  GetLastUpdate,
  IngestPatientList,
  ListAuditLog,
  ListReviewQueue,
  MergePatients,
  ResolveReviewCase,
  ResolveTeamMember,
  SearchPatients,
  VerifyHumanChallenge,
} from "@evzla/core";
import { getDb } from "@evzla/db/client";
import { createAnonClient } from "@/lib/supabase/anon";
import { SheetjsPatientListParser } from "@/lib/infrastructure/patient-registry/sheetjs-patient-list-parser";
import {
  DrizzleAuditLog,
  DrizzleIngestionUnitOfWork,
} from "@/lib/infrastructure/patient-registry/drizzle-repositories";
import { DrizzleTeamMemberRepository } from "@/lib/infrastructure/patient-registry/drizzle-team-member-repository";
import { DrizzleAuditLogReader } from "@/lib/infrastructure/patient-registry/drizzle-audit-log-reader";
import { DrizzleLastUpdateReader } from "@/lib/infrastructure/patient-registry/drizzle-last-update-reader";
import { DrizzleReviewQueueReader } from "@/lib/infrastructure/patient-registry/drizzle-review-queue-reader";
import { DrizzlePatientMerger } from "@/lib/infrastructure/patient-registry/drizzle-patient-merger";
import { SupabasePatientSearchGateway } from "@/lib/infrastructure/patient-registry/supabase-patient-search-gateway";
import { CloudflareTurnstileVerifier } from "@/lib/infrastructure/patient-registry/cloudflare-turnstile-verifier";

// Composition root: inyecta los adapters en los casos de uso (solo servidor).

export function ingestPatientListUseCase(): IngestPatientList {
  return new IngestPatientList({
    parser: new SheetjsPatientListParser(),
    uow: new DrizzleIngestionUnitOfWork(getDb()),
    newId: () => crypto.randomUUID(),
  });
}

export function searchPatientsUseCase(): SearchPatients {
  return new SearchPatients(new SupabasePatientSearchGateway(createAnonClient()));
}

export function verifyHumanChallengeUseCase(): VerifyHumanChallenge {
  // Sin secreto, el verifier falla cerrado (verify -> false): es deliberado.
  return new VerifyHumanChallenge(
    new CloudflareTurnstileVerifier(process.env.TURNSTILE_SECRET_KEY ?? ""),
  );
}

export function resolveTeamMemberUseCase(): ResolveTeamMember {
  return new ResolveTeamMember(new DrizzleTeamMemberRepository(getDb()));
}

export function listAuditLogUseCase(): ListAuditLog {
  return new ListAuditLog(new DrizzleAuditLogReader(getDb()));
}

export function getLastUpdateUseCase(): GetLastUpdate {
  return new GetLastUpdate(new DrizzleLastUpdateReader(getDb()));
}

export function listReviewQueueUseCase(): ListReviewQueue {
  return new ListReviewQueue(new DrizzleReviewQueueReader(getDb()));
}

export function resolveReviewCaseUseCase(): ResolveReviewCase {
  return new ResolveReviewCase(new DrizzleAuditLog(getDb()));
}

export function mergePatientsUseCase(): MergePatients {
  return new MergePatients(new DrizzlePatientMerger(getDb()));
}
