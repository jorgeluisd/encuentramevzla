// Errores de dominio de la capacidad solidarity-services.
export class InvalidServiceInputError extends Error {
  constructor(message = "invalid service input") {
    super(message);
    this.name = "InvalidServiceInputError";
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
