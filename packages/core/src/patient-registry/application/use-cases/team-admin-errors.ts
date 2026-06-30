// Errores compartidos de la gestión de equipo/hospitales (P4).
export class TeamAdminForbiddenError extends Error {
  constructor(message = "forbidden: team administration") {
    super(message);
    this.name = "TeamAdminForbiddenError";
  }
}

export class InvalidTeamInputError extends Error {
  constructor(message = "invalid input") {
    super(message);
    this.name = "InvalidTeamInputError";
  }
}

export class EmailAlreadyMemberError extends Error {
  constructor() {
    super("email already a team member");
    this.name = "EmailAlreadyMemberError";
  }
}

export class TeamMemberNotFoundError extends Error {
  constructor() {
    super("team member not found");
    this.name = "TeamMemberNotFoundError";
  }
}
