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
export * from "./patient-registry/domain/value-objects/patient-status";
export * from "./patient-registry/domain/services/string-similarity";
export * from "./patient-registry/domain/services/patient-matching";
export * from "./patient-registry/domain/services/patient-merge";

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
export * from "./patient-registry/application/ports/patient-merger";
export * from "./patient-registry/application/ports/hospital-patient-export-reader";
export * from "./patient-registry/application/ports/speech-transcriber";
export * from "./patient-registry/application/ports/patient-row-extractor";
export * from "./patient-registry/application/use-cases/search-patients";
export * from "./patient-registry/application/use-cases/verify-human-challenge";
export * from "./patient-registry/application/use-cases/ingest-patient-list";
export * from "./patient-registry/application/use-cases/ingestion-status";
export * from "./patient-registry/application/use-cases/resolve-team-member";
export * from "./patient-registry/application/use-cases/list-audit-log";
export * from "./patient-registry/application/use-cases/list-review-queue";
export * from "./patient-registry/application/use-cases/resolve-review-case";
export * from "./patient-registry/application/use-cases/merge-patients";
export * from "./patient-registry/application/use-cases/get-last-update";
export * from "./patient-registry/application/use-cases/export-hospital-patients";
export * from "./patient-registry/application/use-cases/transcribe-patient-dictation";
