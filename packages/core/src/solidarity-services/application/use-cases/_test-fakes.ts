import type {
  ListByStatusInput,
  NewSolidarityServiceRecord,
  ServiceChanges,
  ServicesPage,
  SolidarityServiceRecord,
  SolidarityServiceRepository,
} from "../ports/solidarity-service-repository";

// Repo en memoria para los tests de los use cases (no producción).
export class InMemoryRepo implements SolidarityServiceRepository {
  rows = new Map<string, SolidarityServiceRecord>();
  updates: Array<{ id: string; changes: ServiceChanges }> = [];

  seed(record: SolidarityServiceRecord): void {
    this.rows.set(record.id, record);
  }

  async create(record: NewSolidarityServiceRecord): Promise<void> {
    this.rows.set(record.id, {
      reported: false,
      reportedAt: null,
      reportReason: null,
      rejectionReason: null,
      reviewedBy: null,
      reviewedAt: null,
      ...record,
    });
  }

  async countActiveByEmail(email: string): Promise<number> {
    return [...this.rows.values()].filter(
      (r) => r.submitterEmail === email && (r.status === "pending" || r.status === "approved"),
    ).length;
  }

  async listByStatus(input: ListByStatusInput): Promise<ServicesPage> {
    const all = [...this.rows.values()].filter((r) => r.status === input.status);
    return { items: all.slice(input.offset, input.offset + input.limit), total: all.length };
  }

  async listAll(input: { limit: number; offset: number }): Promise<ServicesPage> {
    const all = [...this.rows.values()];
    return { items: all.slice(input.offset, input.offset + input.limit), total: all.length };
  }

  async findById(id: string): Promise<SolidarityServiceRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async findByTokenHash(tokenHash: string): Promise<SolidarityServiceRecord | null> {
    return [...this.rows.values()].find((r) => r.editTokenHash === tokenHash) ?? null;
  }

  async updateById(id: string, changes: ServiceChanges): Promise<void> {
    this.updates.push({ id, changes });
    const existing = this.rows.get(id);
    if (existing) this.rows.set(id, { ...existing, ...changes });
  }
}

export function makeRecord(over: Partial<SolidarityServiceRecord> = {}): SolidarityServiceRecord {
  const base = new Date("2026-07-05T00:00:00.000Z");
  return {
    id: "svc-1",
    title: "Inspección estructural",
    category: "Ingeniería y evaluación estructural",
    description: "Reviso estructuras dañadas por el sismo, sin costo.",
    contactPhone: "+58 412 123 4567",
    submitterEmail: "ana@example.co",
    status: "pending",
    editTokenHash: "hash(tok-raw)",
    acceptedTermsAt: base,
    expiresAt: new Date("2026-10-03T00:00:00.000Z"),
    reported: false,
    reportedAt: null,
    reportReason: null,
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: base,
    updatedAt: base,
    ...over,
  };
}
