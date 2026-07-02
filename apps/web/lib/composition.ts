import "server-only";

import {
  CreateHospital,
  EditPatient,
  ExportHospitalPatients,
  GetLastUpdate,
  IngestPatientList,
  InviteTeamMember,
  ListAuditLog,
  ListHospitals,
  ListReviewQueue,
  ListTeamMembers,
  MergePatients,
  ResolveReviewCase,
  ResolveTeamMember,
  SearchPatients,
  SetTeamMemberAccess,
  TranscribePatientDictation,
  UpdateHospital,
  VerifyHumanChallenge,
} from "@evzla/core";
import { getDb } from "@evzla/db/client";
import { createAnonClient } from "@/lib/supabase/anon";
import { SheetjsPatientListParser } from "@/lib/infrastructure/patient-registry/sheetjs-patient-list-parser";
import {
  DrizzleAuditLog,
  DrizzleIngestionUnitOfWork,
} from "@/lib/infrastructure/patient-registry/drizzle-repositories";
import { DrizzleHospitalPatientExportReader } from "@/lib/infrastructure/patient-registry/drizzle-hospital-patient-export-reader";
import { OpenAiSpeechTranscriber } from "@/lib/infrastructure/patient-registry/openai-speech-transcriber";
import { ClaudePatientRowExtractor } from "@/lib/infrastructure/patient-registry/claude-patient-row-extractor";
import { DrizzlePatientEditor } from "@/lib/infrastructure/patient-registry/drizzle-patient-editor";
import { DrizzleHospitalPatientListReader } from "@/lib/infrastructure/patient-registry/drizzle-hospital-patient-list-reader";
import { DrizzleHospitalDirectory } from "@/lib/infrastructure/patient-registry/drizzle-hospital-directory";
import { DrizzleHospitalAdmin } from "@/lib/infrastructure/patient-registry/drizzle-hospital-admin";
import { DrizzleTeamMemberAdmin } from "@/lib/infrastructure/patient-registry/drizzle-team-member-admin";
import { DrizzleTeamMemberRepository } from "@/lib/infrastructure/patient-registry/drizzle-team-member-repository";
import { DrizzleAuditLogReader } from "@/lib/infrastructure/patient-registry/drizzle-audit-log-reader";
import { DrizzleLastUpdateReader } from "@/lib/infrastructure/patient-registry/drizzle-last-update-reader";
import { DrizzleReviewQueueReader } from "@/lib/infrastructure/patient-registry/drizzle-review-queue-reader";
import { DrizzleForeignRowsReader } from "@/lib/infrastructure/patient-registry/drizzle-foreign-rows-reader";
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

export function reviewQueueReader(): DrizzleReviewQueueReader {
  return new DrizzleReviewQueueReader(getDb());
}

export function foreignRowsReader(): DrizzleForeignRowsReader {
  return new DrizzleForeignRowsReader(getDb());
}

export function listReviewQueueUseCase(): ListReviewQueue {
  return new ListReviewQueue(reviewQueueReader());
}

export function resolveReviewCaseUseCase(): ResolveReviewCase {
  return new ResolveReviewCase(new DrizzleAuditLog(getDb()));
}

export function mergePatientsUseCase(): MergePatients {
  return new MergePatients(new DrizzlePatientMerger(getDb()));
}

export function exportHospitalPatientsUseCase(): ExportHospitalPatients {
  return new ExportHospitalPatients(new DrizzleHospitalPatientExportReader(getDb()));
}

// Escritor de auditoría (server-side) para acciones fuera del flujo de ingesta (p.ej. descargas).
export function auditLogWriter(): DrizzleAuditLog {
  return new DrizzleAuditLog(getDb());
}

export function editPatientUseCase(): EditPatient {
  return new EditPatient(new DrizzlePatientEditor(getDb()));
}

export function hospitalPatientListReader(): DrizzleHospitalPatientListReader {
  return new DrizzleHospitalPatientListReader(getDb());
}

export function hospitalDirectory(): DrizzleHospitalDirectory {
  return new DrizzleHospitalDirectory(getDb());
}

// El admin de equipo se comparte entre las acciones (lista + invitar + acceso).
export function teamMemberAdmin(): DrizzleTeamMemberAdmin {
  return new DrizzleTeamMemberAdmin(getDb());
}

// El admin de hospitales se comparte entre crear/listar/actualizar.
export function hospitalAdmin(): DrizzleHospitalAdmin {
  return new DrizzleHospitalAdmin(getDb());
}

export function createHospitalUseCase(): CreateHospital {
  return new CreateHospital(hospitalAdmin());
}

export function listHospitalsUseCase(): ListHospitals {
  return new ListHospitals(hospitalAdmin());
}

export function updateHospitalUseCase(): UpdateHospital {
  return new UpdateHospital(hospitalAdmin());
}

export function inviteTeamMemberUseCase(): InviteTeamMember {
  return new InviteTeamMember(teamMemberAdmin());
}

export function listTeamMembersUseCase(): ListTeamMembers {
  return new ListTeamMembers(teamMemberAdmin());
}

export function setTeamMemberAccessUseCase(): SetTeamMemberAccess {
  return new SetTeamMemberAccess(teamMemberAdmin());
}

export function transcribePatientDictationUseCase(): TranscribePatientDictation {
  // Los SDK externos (STT + extracción) viven en infraestructura; las claves, en el entorno.
  return new TranscribePatientDictation({
    transcriber: new OpenAiSpeechTranscriber(process.env.OPENAI_API_KEY ?? ""),
    extractor: new ClaudePatientRowExtractor(process.env.ANTHROPIC_API_KEY ?? ""),
  });
}
