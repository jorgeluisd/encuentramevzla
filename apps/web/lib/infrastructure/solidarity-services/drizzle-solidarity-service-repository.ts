import { and, count, desc, eq, inArray } from "drizzle-orm";
import { solidarityServices } from "@evzla/db";
import type { getDb } from "@evzla/db/client";
import type {
  ListByStatusInput,
  NewSolidarityServiceRecord,
  ServiceChanges,
  ServicesPage,
  SolidarityServiceRecord,
  SolidarityServiceRepository,
} from "@evzla/core";

type Db = ReturnType<typeof getDb>;

// Escritura por conexión directa (service_role, salta RLS). Solo servidor.
export class DrizzleSolidarityServiceRepository implements SolidarityServiceRepository {
  constructor(private readonly db: Db) {}

  async create(record: NewSolidarityServiceRecord): Promise<void> {
    await this.db.insert(solidarityServices).values({
      id: record.id,
      title: record.title,
      category: record.category,
      description: record.description,
      contactPhone: record.contactPhone,
      submitterEmail: record.submitterEmail,
      status: record.status,
      editTokenHash: record.editTokenHash,
      acceptedTermsAt: record.acceptedTermsAt,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async countActiveByEmail(email: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(solidarityServices)
      .where(
        and(
          eq(solidarityServices.submitterEmail, email),
          inArray(solidarityServices.status, ["pending", "approved"]),
        ),
      );
    return row?.n ?? 0;
  }

  async listByStatus(input: ListByStatusInput): Promise<ServicesPage> {
    const where = eq(solidarityServices.status, input.status);
    const [items, [totalRow]] = await Promise.all([
      this.db
        .select()
        .from(solidarityServices)
        .where(where)
        .orderBy(desc(solidarityServices.createdAt))
        .limit(input.limit)
        .offset(input.offset),
      this.db.select({ n: count() }).from(solidarityServices).where(where),
    ]);
    return { items: items.map(toRecord), total: totalRow?.n ?? 0 };
  }

  async listAll(input: { limit: number; offset: number }): Promise<ServicesPage> {
    const [items, [totalRow]] = await Promise.all([
      this.db
        .select()
        .from(solidarityServices)
        .orderBy(desc(solidarityServices.createdAt))
        .limit(input.limit)
        .offset(input.offset),
      this.db.select({ n: count() }).from(solidarityServices),
    ]);
    return { items: items.map(toRecord), total: totalRow?.n ?? 0 };
  }

  async findById(id: string): Promise<SolidarityServiceRecord | null> {
    const [row] = await this.db
      .select()
      .from(solidarityServices)
      .where(eq(solidarityServices.id, id))
      .limit(1);
    return row ? toRecord(row) : null;
  }

  async findByTokenHash(tokenHash: string): Promise<SolidarityServiceRecord | null> {
    const [row] = await this.db
      .select()
      .from(solidarityServices)
      .where(eq(solidarityServices.editTokenHash, tokenHash))
      .limit(1);
    return row ? toRecord(row) : null;
  }

  async updateById(id: string, changes: ServiceChanges): Promise<void> {
    if (Object.keys(changes).length === 0) return;
    await this.db.update(solidarityServices).set(changes).where(eq(solidarityServices.id, id));
  }
}

type Row = typeof solidarityServices.$inferSelect;

function toRecord(row: Row): SolidarityServiceRecord {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description,
    contactPhone: row.contactPhone,
    submitterEmail: row.submitterEmail,
    status: row.status as SolidarityServiceRecord["status"],
    editTokenHash: row.editTokenHash,
    acceptedTermsAt: row.acceptedTermsAt,
    expiresAt: row.expiresAt,
    reported: row.reported,
    reportedAt: row.reportedAt,
    reportReason: row.reportReason,
    rejectionReason: row.rejectionReason,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
