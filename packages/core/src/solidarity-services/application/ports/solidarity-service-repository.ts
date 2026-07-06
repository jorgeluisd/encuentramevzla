import type { ServiceStatus } from "../../domain/value-objects/service-status";

// Registro completo tal como se persiste. `submitterEmail` y `editTokenHash` son PRIVADOS:
// nunca salen por el directorio público (RPC).
export interface SolidarityServiceRecord {
  id: string;
  title: string;
  category: string;
  description: string;
  contactPhone: string; // público por diseño (con consentimiento)
  submitterEmail: string; // privado
  status: ServiceStatus;
  editTokenHash: string; // solo el hash; el token en claro va en el enlace del email
  acceptedTermsAt: Date;
  expiresAt: Date;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Alta: el use case construye el registro (con `now` inyectado) y el adapter lo inserta.
export type NewSolidarityServiceRecord = Omit<
  SolidarityServiceRecord,
  "rejectionReason" | "reviewedBy" | "reviewedAt"
>;

export interface ListByStatusInput {
  status: ServiceStatus;
  limit: number;
  offset: number;
}

export interface ServicesPage {
  items: SolidarityServiceRecord[];
  total: number;
}

// Campos mutables por moderación o por el dueño (vía enlace mágico).
export type ServiceChanges = Partial<
  Pick<
    SolidarityServiceRecord,
    | "title"
    | "category"
    | "description"
    | "contactPhone"
    | "status"
    | "rejectionReason"
    | "reviewedBy"
    | "reviewedAt"
    | "expiresAt"
    | "updatedAt"
  >
>;

// Port de ESCRITURA (service_role, salta RLS por diseño).
export interface SolidarityServiceRepository {
  create(record: NewSolidarityServiceRecord): Promise<void>;
  countActiveByEmail(email: string): Promise<number>; // pending + approved
  listByStatus(input: ListByStatusInput): Promise<ServicesPage>;
  findByTokenHash(tokenHash: string): Promise<SolidarityServiceRecord | null>;
  updateById(id: string, changes: ServiceChanges): Promise<void>;
}
