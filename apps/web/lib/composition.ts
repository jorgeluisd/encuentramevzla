import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  ApproveService,
  CreateHospital,
  EditPatient,
  EditServiceByToken,
  ExportHospitalPatients,
  GetLastUpdate,
  IngestPatientList,
  InviteTeamMember,
  ListAuditLog,
  ListAllServices,
  ListHospitals,
  ListPendingServices,
  ListPublishedServices,
  ListReviewQueue,
  ListServicesByStatus,
  ListTeamMembers,
  MergePatients,
  RegenerateManageLink,
  RejectService,
  RemoveServiceByToken,
  ReportService,
  DismissReport,
  TakeDownService,
  ResolveReviewCase,
  ResolveTeamMember,
  SearchPatients,
  SetTeamMemberAccess,
  SubmitSolidarityService,
  TranscribePatientDictation,
  UpdateHospital,
  VerifyHumanChallenge,
  type ServiceConfirmationMailer,
  type WelcomeMailer,
} from "@evzla/core";
import { getDb } from "@evzla/db/client";
import { createAnonClient } from "@/lib/supabase/anon";
import { SheetjsPatientListParser } from "@/lib/infrastructure/patient-registry/sheetjs-patient-list-parser";
import { DrizzleAuditLog, DrizzleIngestionUnitOfWork } from "@evzla/db/ingest";
import { DrizzleHospitalPatientExportReader } from "@/lib/infrastructure/patient-registry/drizzle-hospital-patient-export-reader";
import { OpenAiSpeechTranscriber } from "@/lib/infrastructure/patient-registry/openai-speech-transcriber";
import { ClaudePatientRowExtractor } from "@/lib/infrastructure/patient-registry/claude-patient-row-extractor";
import { DrizzlePatientEditor } from "@/lib/infrastructure/patient-registry/drizzle-patient-editor";
import { DrizzleHospitalPatientListReader } from "@/lib/infrastructure/patient-registry/drizzle-hospital-patient-list-reader";
import { DrizzleHospitalDirectory } from "@/lib/infrastructure/patient-registry/drizzle-hospital-directory";
import { DrizzleHospitalAdmin } from "@/lib/infrastructure/patient-registry/drizzle-hospital-admin";
import { DrizzleTeamMemberAdmin } from "@/lib/infrastructure/patient-registry/drizzle-team-member-admin";
import { ResendWelcomeMailer } from "@/lib/infrastructure/patient-registry/resend-welcome-mailer";
import { DrizzleTeamMemberRepository } from "@/lib/infrastructure/patient-registry/drizzle-team-member-repository";
import { DrizzleAuditLogReader } from "@/lib/infrastructure/patient-registry/drizzle-audit-log-reader";
import { DrizzleLastUpdateReader } from "@/lib/infrastructure/patient-registry/drizzle-last-update-reader";
import { DrizzleReviewQueueReader } from "@/lib/infrastructure/patient-registry/drizzle-review-queue-reader";
import { DrizzleForeignRowsReader } from "@/lib/infrastructure/patient-registry/drizzle-foreign-rows-reader";
import { DrizzlePatientMerger } from "@/lib/infrastructure/patient-registry/drizzle-patient-merger";
import { SupabasePatientSearchGateway } from "@/lib/infrastructure/patient-registry/supabase-patient-search-gateway";
import { CloudflareTurnstileVerifier } from "@/lib/infrastructure/patient-registry/cloudflare-turnstile-verifier";
import { DrizzleSolidarityServiceRepository } from "@/lib/infrastructure/solidarity-services/drizzle-solidarity-service-repository";
import { SupabaseSolidarityServiceDirectory } from "@/lib/infrastructure/solidarity-services/supabase-solidarity-service-directory";
import { ResendServiceConfirmationMailer } from "@/lib/infrastructure/solidarity-services/resend-service-confirmation-mailer";

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

// Correo transaccional de bienvenida. Sin RESEND_API_KEY, el adapter hace no-op
// (falla cerrado): el alta no depende del correo.
export function welcomeMailer(): WelcomeMailer {
  return new ResendWelcomeMailer(
    process.env.RESEND_API_KEY ?? "",
    process.env.MAIL_FROM ?? "EncuéntrameVzla <no-reply@encuentramevzla.com>",
  );
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

// --- solidarity-services (directorio de servicios solidarios, spec 0023) ---

// Escritura por service_role (Drizzle); se comparte entre los use cases de gestión.
export function solidarityServiceRepo(): DrizzleSolidarityServiceRepository {
  return new DrizzleSolidarityServiceRepository(getDb());
}

// Hash del token de edición: solo se persiste el hash (el token en claro va en el enlace).
function hashEditToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function submitSolidarityServiceUseCase(): SubmitSolidarityService {
  return new SubmitSolidarityService({
    repo: solidarityServiceRepo(),
    newId: () => randomUUID(),
    newToken: () => randomUUID(),
    hashToken: hashEditToken,
    now: () => new Date(),
  });
}

export function listPublishedServicesUseCase(): ListPublishedServices {
  return new ListPublishedServices(new SupabaseSolidarityServiceDirectory(createAnonClient()));
}

export function listPendingServicesUseCase(): ListPendingServices {
  return new ListPendingServices(solidarityServiceRepo());
}

export function listServicesByStatusUseCase(): ListServicesByStatus {
  return new ListServicesByStatus(solidarityServiceRepo());
}

export function listAllServicesUseCase(): ListAllServices {
  return new ListAllServices(solidarityServiceRepo());
}

export function regenerateManageLinkUseCase(): RegenerateManageLink {
  return new RegenerateManageLink({
    repo: solidarityServiceRepo(),
    newToken: () => randomUUID(),
    hashToken: hashEditToken,
    now: () => new Date(),
  });
}

export function approveServiceUseCase(): ApproveService {
  return new ApproveService({ repo: solidarityServiceRepo(), now: () => new Date() });
}

export function rejectServiceUseCase(): RejectService {
  return new RejectService({ repo: solidarityServiceRepo(), now: () => new Date() });
}

export function reportServiceUseCase(): ReportService {
  return new ReportService({ repo: solidarityServiceRepo(), now: () => new Date() });
}

export function dismissReportUseCase(): DismissReport {
  return new DismissReport({ repo: solidarityServiceRepo(), now: () => new Date() });
}

export function takeDownServiceUseCase(): TakeDownService {
  return new TakeDownService({ repo: solidarityServiceRepo(), now: () => new Date() });
}

export function editServiceByTokenUseCase(): EditServiceByToken {
  return new EditServiceByToken({
    repo: solidarityServiceRepo(),
    hashToken: hashEditToken,
    now: () => new Date(),
  });
}

export function removeServiceByTokenUseCase(): RemoveServiceByToken {
  return new RemoveServiceByToken({
    repo: solidarityServiceRepo(),
    hashToken: hashEditToken,
    now: () => new Date(),
  });
}

// Correo de confirmación best-effort (mismo patrón que welcomeMailer).
export function serviceConfirmationMailer(): ServiceConfirmationMailer {
  return new ResendServiceConfirmationMailer(
    process.env.RESEND_API_KEY ?? "",
    process.env.MAIL_FROM ?? "EncuéntrameVzla <no-reply@encuentramevzla.com>",
  );
}

export interface ServiceForEdit {
  title: string;
  category: string;
  description: string;
  contactPhone: string;
  status: string;
  expiresAt: Date;
}

// Carga (server-side) los campos editables por token para prefilar el formulario de
// gestión. Devuelve solo lo editable — nunca el email ni el hash del token.
export async function findServiceForEdit(token: string): Promise<ServiceForEdit | null> {
  const record = await solidarityServiceRepo().findByTokenHash(hashEditToken(token));
  if (!record) return null;
  return {
    title: record.title,
    category: record.category,
    description: record.description,
    contactPhone: record.contactPhone,
    status: record.status,
    expiresAt: record.expiresAt,
  };
}
