// Arma el término único de búsqueda desde los 3 campos de la UI (nombre/apellido/cédula).
// El RPC recibe un solo `termino`; aquí solo se combina, sin normalizar tildes/minúsculas
// (eso ya vive en el caso de uso/RPC). La cédula, si viene, gana por ser más precisa.
export interface SearchTermInput {
  name?: string;
  surname?: string;
  documentId?: string;
}

export function buildSearchTerm(input: SearchTermInput): string {
  const documentId = (input.documentId ?? "").trim();
  if (documentId.length > 0) return documentId;

  return `${input.name ?? ""} ${input.surname ?? ""}`
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .join(" ");
}
