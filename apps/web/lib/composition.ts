import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  ApproveService,
  CreateHospital,
  EditPatient,
  EditServiceByToken,
  ExportHospitalPatients,
  GetAdminMetrics,
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
import { DrizzleMetricsReader } from "@/lib/infrastructure/patient-registry/drizzle-metrics-reader";
import { DrizzleForeignRowsReader } from "@/lib/infrastructure/patient-registry/drizzle-foreign-rows-reader";
import { DrizzlePatientMerger } from "@/lib/infrastructure/patient-registry/drizzle-patient-merger";
import { DrizzlePatientSearchGateway } from "@/lib/infrastructure/patient-registry/drizzle-patient-search-gateway";
import { CloudflareTurnstileVerifier } from "@/lib/infrastructure/patient-registry/cloudflare-turnstile-verifier";
import { DrizzleSolidarityServiceRepository } from "@/lib/infrastructure/solidarity-services/drizzle-solidarity-service-repository";
import { DrizzleSolidarityServiceDirectory } from "@/lib/infrastructure/solidarity-services/drizzle-solidarity-service-directory";
import { ResendServiceConfirmationMailer } from "@/lib/infrastructure/solidarity-services/resend-service-confirmation-mailer";
import { CognitoTeamIdentityProvisioner } from "@/lib/infrastructure/auth/cognito-team-identity-provisioner";
import { cognitoClient, requiredAuthEnv } from "@/lib/auth/cognito";
import { appSecret } from "@/lib/infrastructure/app-secrets";
import { S3Client } from "@aws-sdk/client-s3";
import { S3UploadStore } from "@/lib/infrastructure/uploads/s3-upload-store";

// Composition root: inyecta los adapters en los casos de uso (solo servidor).

export function ingestPatientListUseCase(): IngestPatientList {
  return new IngestPatientList({
    parser: new SheetjsPatientListParser(),
    uow: new DrizzleIngestionUnitOfWork(getDb("admin")),
    newId: () => crypto.randomUUID(),
  });
}

export function searchPatientsUseCase(): SearchPatients {
  return new SearchPatients(new DrizzlePatientSearchGateway(getDb("public")));
}

export async function verifyHumanChallengeUseCase(): Promise<VerifyHumanChallenge> {
  // Sin secreto, el verifier falla cerrado (verify -> false): es deliberado.
  return new VerifyHumanChallenge(
    new CloudflareTurnstileVerifier(await appSecret("TURNSTILE_SECRET_KEY")),
  );
}

export function resolveTeamMemberUseCase(): ResolveTeamMember {
  return new ResolveTeamMember(new DrizzleTeamMemberRepository(getDb("admin")));
}

export function listAuditLogUseCase(): ListAuditLog {
  return new ListAuditLog(new DrizzleAuditLogReader(getDb("admin")));
}

export function getLastUpdateUseCase(): GetLastUpdate {
  return new GetLastUpdate(new DrizzleLastUpdateReader(getDb("admin")));
}

export function reviewQueueReader(): DrizzleReviewQueueReader {
  return new DrizzleReviewQueueReader(getDb("admin"));
}

export function foreignRowsReader(): DrizzleForeignRowsReader {
  return new DrizzleForeignRowsReader(getDb("admin"));
}

export function listReviewQueueUseCase(): ListReviewQueue {
  return new ListReviewQueue(reviewQueueReader());
}

export function getAdminMetricsUseCase(): GetAdminMetrics {
  return new GetAdminMetrics(new DrizzleMetricsReader(getDb("admin")));
}

export function resolveReviewCaseUseCase(): ResolveReviewCase {
  return new ResolveReviewCase(new DrizzleAuditLog(getDb("admin")));
}

export function mergePatientsUseCase(): MergePatients {
  return new MergePatients(new DrizzlePatientMerger(getDb("admin")));
}

export function exportHospitalPatientsUseCase(): ExportHospitalPatients {
  return new ExportHospitalPatients(new DrizzleHospitalPatientExportReader(getDb("admin")));
}

// Escritor de auditoría (server-side) para acciones fuera del flujo de ingesta (p.ej. descargas).
export function auditLogWriter(): DrizzleAuditLog {
  return new DrizzleAuditLog(getDb("admin"));
}

export function editPatientUseCase(): EditPatient {
  return new EditPatient(new DrizzlePatientEditor(getDb("admin")));
}

export function hospitalPatientListReader(): DrizzleHospitalPatientListReader {
  return new DrizzleHospitalPatientListReader(getDb("admin"));
}

export function hospitalDirectory(): DrizzleHospitalDirectory {
  return new DrizzleHospitalDirectory(getDb("admin"));
}

// El admin de equipo se comparte entre las acciones (lista + invitar + acceso).
export function teamMemberAdmin(): DrizzleTeamMemberAdmin {
  return new DrizzleTeamMemberAdmin(getDb("admin"));
}

// El admin de hospitales se comparte entre crear/listar/actualizar.
export function hospitalAdmin(): DrizzleHospitalAdmin {
  return new DrizzleHospitalAdmin(getDb("admin"));
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
  return new InviteTeamMember(
    teamMemberAdmin(),
    new CognitoTeamIdentityProvisioner(cognitoClient(), requiredAuthEnv("COGNITO_USER_POOL_ID")),
  );
}

// Correo transaccional de bienvenida. Sin RESEND_API_KEY, el adapter hace no-op
// (falla cerrado): el alta no depende del correo.
export async function welcomeMailer(): Promise<WelcomeMailer> {
  return new ResendWelcomeMailer(
    await appSecret("RESEND_API_KEY"),
    process.env.MAIL_FROM ?? "EncuéntrameVzla <no-reply@encuentramevzla.com>",
  );
}

export function listTeamMembersUseCase(): ListTeamMembers {
  return new ListTeamMembers(teamMemberAdmin());
}

export function setTeamMemberAccessUseCase(): SetTeamMemberAccess {
  return new SetTeamMemberAccess(teamMemberAdmin());
}

export async function transcribePatientDictationUseCase(): Promise<TranscribePatientDictation> {
  return new TranscribePatientDictation({
    transcriber: new OpenAiSpeechTranscriber(await appSecret("OPENAI_API_KEY")),
    extractor: new ClaudePatientRowExtractor(await appSecret("ANTHROPIC_API_KEY")),
  });
}

// --- solidarity-services (directorio de servicios solidarios, spec 0023) ---

// Escritura con el rol admin (Drizzle); se comparte entre los use cases de gestión.
export function solidarityServiceRepo(): DrizzleSolidarityServiceRepository {
  return new DrizzleSolidarityServiceRepository(getDb("admin"));
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
  return new ListPublishedServices(new DrizzleSolidarityServiceDirectory(getDb("public")));
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
export async function serviceConfirmationMailer(): Promise<ServiceConfirmationMailer> {
  return new ResendServiceConfirmationMailer(
    await appSecret("RESEND_API_KEY"),
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

// Bucket de subidas (AWS). Sin EVZLA_UPLOADS_BUCKET (dev local) el Excel viaja en la Server Action.
let _s3: S3Client | null = null;
export function uploadStore(): S3UploadStore | null {
  const bucket = process.env.EVZLA_UPLOADS_BUCKET;
  if (!bucket) return null;
  _s3 ??= new S3Client({});
  return new S3UploadStore(_s3, bucket);
}
