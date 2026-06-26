// Barrel público de @evzla/core (dominio + aplicación de patient-registry).

// domain
export * from "./patient-registry/domain/value-objects/person-name";
export * from "./patient-registry/domain/value-objects/display-name";
export * from "./patient-registry/domain/value-objects/search-term";
export * from "./patient-registry/domain/value-objects/team-role";
export * from "./patient-registry/domain/value-objects/audit-action";
export * from "./patient-registry/domain/value-objects/document-id";
export * from "./patient-registry/domain/value-objects/patient-status";
export * from "./patient-registry/domain/services/string-similarity";
export * from "./patient-registry/domain/services/patient-matching";

// application
export * from "./patient-registry/application/ports/patient-list-parser";
export * from "./patient-registry/application/ports/patient-search-gateway";
export * from "./patient-registry/application/ports/repositories";
export * from "./patient-registry/application/ports/team-member-repository";
export * from "./patient-registry/application/ports/audit-log-reader";
export * from "./patient-registry/application/use-cases/search-patients";
export * from "./patient-registry/application/use-cases/ingest-patient-list";
export * from "./patient-registry/application/use-cases/ingestion-status";
export * from "./patient-registry/application/use-cases/resolve-team-member";
export * from "./patient-registry/application/use-cases/list-audit-log";
