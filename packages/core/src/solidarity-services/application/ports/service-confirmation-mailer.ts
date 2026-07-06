export interface ServiceConfirmationInput {
  email: string;
  editUrl: string; // enlace mágico de gestión (contiene el token en claro)
}

// Correo best-effort de confirmación ("recibimos tu publicación, en revisión").
export interface ServiceConfirmationMailer {
  sendConfirmation(input: ServiceConfirmationInput): Promise<void>;
}
