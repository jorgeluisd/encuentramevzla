// DTO público: SOLO columnas visibles. Nunca incluye email ni token.
export interface PublicService {
  id: string;
  title: string;
  category: string;
  description: string;
  contactPhone: string;
  createdAt: Date;
}

export interface ListPublishedInput {
  category?: string;
  q?: string;
}

// Port de LECTURA pública mediada (implementado por el RPC `list_solidarity_services`).
export interface SolidarityServiceDirectory {
  list(input: ListPublishedInput): Promise<PublicService[]>;
}
