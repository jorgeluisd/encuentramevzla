// Etiqueta loggeable de un error: nombre + código. Nunca el mensaje: el de Drizzle incluye los
// parámetros de la query y el de los proveedores de correo, la dirección del destinatario.
export function safeErrorTag(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const cause = (error as { cause?: { code?: unknown } }).cause;
  const code = cause?.code ?? (error as { code?: unknown }).code;
  return typeof code === "string" ? `${error.name}:${code}` : error.name;
}
