// Errores de dominio de la capacidad solidarity-services.

// Campos del alta/edición que pueden fallar la validación de dominio.
export type ServiceInputField =
  | "title"
  | "category"
  | "description"
  | "contactPhone"
  | "submitterEmail";

export class InvalidServiceInputError extends Error {
  // Qué campos concretos fallaron (para dar un mensaje específico en la UI).
  readonly fields: readonly ServiceInputField[];
  constructor(fields: readonly ServiceInputField[] = []) {
    super("invalid service input");
    this.name = "InvalidServiceInputError";
    this.fields = fields;
  }
}

export class TermsNotAcceptedError extends Error {
  constructor() {
    super("terms not accepted");
    this.name = "TermsNotAcceptedError";
  }
}

export class TooManyActiveServicesError extends Error {
  constructor() {
    super("too many active services for this email");
    this.name = "TooManyActiveServicesError";
  }
}

export class ServiceNotFoundError extends Error {
  constructor() {
    super("service not found");
    this.name = "ServiceNotFoundError";
  }
}

export class ServiceModerationForbiddenError extends Error {
  constructor() {
    super("forbidden: service moderation");
    this.name = "ServiceModerationForbiddenError";
  }
}
