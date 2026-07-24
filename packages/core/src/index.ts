// Barrel público de @evzla/core (dominio + aplicación de patient-registry).

// domain
export * from "./patient-registry/domain/value-objects/person-name";
export * from "./patient-registry/domain/value-objects/display-name";
export * from "./patient-registry/domain/value-objects/last-update";
export * from "./patient-registry/domain/value-objects/search-term";
export * from "./patient-registry/domain/value-objects/team-role";
export * from "./patient-registry/domain/value-objects/audit-action";
export * from "./patient-registry/domain/value-objects/review-decision";
export * from "./patient-registry/domain/value-objects/document-id";
export * from "./patient-registry/domain/value-objects/normalized-phone";
export * from "./patient-registry/domain/value-objects/patient-status";
export * from "./patient-registry/domain/services/string-similarity";
export * from "./patient-registry/domain/services/hospital-name";
export * from "./patient-registry/domain/services/patient-matching";
export * from "./patient-registry/domain/services/patient-merge";
export * from "./patient-registry/domain/services/admin-metrics";

// emergency-contacts (capacidad de presentación pública)
export * from "./emergency-contacts/domain/phone";

// application
export * from "./patient-registry/application/ports/patient-list-parser";
export * from "./patient-registry/application/ports/patient-search-gateway";
export * from "./patient-registry/application/ports/human-verification-gateway";
export * from "./patient-registry/application/ports/repositories";
export * from "./patient-registry/application/ports/team-member-repository";
export * from "./patient-registry/application/ports/audit-log-reader";
export * from "./patient-registry/application/ports/last-update-reader";
export * from "./patient-registry/application/ports/review-queue-reader";
export * from "./patient-registry/application/ports/metrics-reader";
export * from "./patient-registry/application/ports/foreign-rows-reader";
export * from "./patient-registry/application/ports/patient-merger";
export * from "./patient-registry/application/ports/hospital-patient-export-reader";
export * from "./patient-registry/application/ports/speech-transcriber";
export * from "./patient-registry/application/ports/patient-row-extractor";
export * from "./patient-registry/application/ports/patient-editor";
export * from "./patient-registry/application/ports/hospital-patient-list-reader";
export * from "./patient-registry/application/ports/hospital-admin";
export * from "./patient-registry/application/ports/team-member-admin";
export * from "./patient-registry/application/ports/welcome-mailer";
export * from "./patient-registry/application/use-cases/search-patients";
export * from "./patient-registry/application/use-cases/verify-human-challenge";
export * from "./patient-registry/application/use-cases/ingest-patient-list";
export * from "./patient-registry/application/use-cases/ingestion-status";
export * from "./patient-registry/application/use-cases/resolve-team-member";
export * from "./patient-registry/application/use-cases/list-audit-log";
export * from "./patient-registry/application/use-cases/list-review-queue";
export * from "./patient-registry/application/use-cases/get-admin-metrics";
export * from "./patient-registry/application/use-cases/resolve-review-case";
export * from "./patient-registry/application/use-cases/merge-patients";
export * from "./patient-registry/application/use-cases/get-last-update";
export * from "./patient-registry/application/use-cases/export-hospital-patients";
export * from "./patient-registry/application/use-cases/transcribe-patient-dictation";
export * from "./patient-registry/application/use-cases/edit-patient";
export * from "./patient-registry/application/use-cases/team-admin-errors";
export * from "./patient-registry/application/use-cases/create-hospital";
export * from "./patient-registry/application/use-cases/list-hospitals";
export * from "./patient-registry/application/use-cases/update-hospital";
export * from "./patient-registry/application/use-cases/invite-team-member";
export * from "./patient-registry/application/use-cases/set-team-member-access";
export * from "./patient-registry/application/use-cases/list-team-members";

// reconciliation (diagnóstico de reconciliación de fuente consolidada, ADR-0008)
export * from "./reconciliation/domain/value-objects/registered-date";
export * from "./reconciliation/domain/services/cedula-cell";
export * from "./reconciliation/domain/services/uncertainty-marker";
export * from "./reconciliation/domain/services/reconciliation-category";
export * from "./reconciliation/application/ports/consolidated-source-reader";
export * from "./reconciliation/application/ports/reconciliation-store";
export * from "./reconciliation/application/ports/report-read-model";
export * from "./reconciliation/application/ports/reconciliation-import-source";
export * from "./reconciliation/application/services/reconciliation-report";
export * from "./reconciliation/application/use-cases/ingest-consolidated-source";
export * from "./reconciliation/application/use-cases/reconcile-against-production";
export * from "./reconciliation/application/use-cases/apply-reconciliation";

// solidarity-services (directorio público de servicios solidarios)
export * from "./solidarity-services/domain/value-objects/service-title";
export * from "./solidarity-services/domain/value-objects/service-description";
export * from "./solidarity-services/domain/value-objects/service-category";
export * from "./solidarity-services/domain/value-objects/submitter-email";
export * from "./solidarity-services/domain/value-objects/service-status";
export * from "./solidarity-services/domain/service-expiry";
export * from "./solidarity-services/application/ports/solidarity-service-repository";
export * from "./solidarity-services/application/ports/solidarity-service-directory";
export * from "./solidarity-services/application/ports/service-confirmation-mailer";
export * from "./solidarity-services/application/use-cases/solidarity-errors";
export * from "./solidarity-services/application/use-cases/submit-solidarity-service";
export * from "./solidarity-services/application/use-cases/approve-service";
export * from "./solidarity-services/application/use-cases/reject-service";
export * from "./solidarity-services/application/use-cases/report-service";
export * from "./solidarity-services/application/use-cases/dismiss-report";
export * from "./solidarity-services/application/use-cases/take-down-service";
export * from "./solidarity-services/application/use-cases/edit-service-by-token";
export * from "./solidarity-services/application/use-cases/remove-service-by-token";
export * from "./solidarity-services/application/use-cases/list-pending-services";
export * from "./solidarity-services/application/use-cases/list-services-by-status";
export * from "./solidarity-services/application/use-cases/list-all-services";
export * from "./solidarity-services/application/use-cases/list-published-services";
export * from "./solidarity-services/application/use-cases/regenerate-manage-link";
