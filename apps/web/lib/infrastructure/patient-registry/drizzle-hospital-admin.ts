import { asc, eq, ilike } from "drizzle-orm";
import { hospitals } from "@evzla/db";
import type { getDb } from "@evzla/db/client";
import type { CreatedHospital, Hospital, HospitalAdmin, HospitalChanges } from "@evzla/core";

type Db = ReturnType<typeof getDb>;

const COLS = {
  id: hospitals.id,
  name: hospitals.name,
  city: hospitals.city,
  infoDeskPhone: hospitals.infoDeskPhone,
  active: hospitals.active,
  provisional: hospitals.provisional,
  test: hospitals.test,
};

// Gestión de hospitales (D13) por conexión directa (service_role). Solo servidor.
export class DrizzleHospitalAdmin implements HospitalAdmin {
  constructor(private readonly db: Db) {}

  async list(options?: { q?: string | null }): Promise<Hospital[]> {
    const q = options?.q ?? null;
    return this.db
      .select(COLS)
      .from(hospitals)
      .where(q ? ilike(hospitals.name, `%${q}%`) : undefined)
      .orderBy(asc(hospitals.name));
  }

  async create(input: {
    name: string;
    city?: string | null;
    infoDeskPhone?: string | null;
  }): Promise<CreatedHospital> {
    const [row] = await this.db
      .insert(hospitals)
      .values({ name: input.name, city: input.city ?? null, infoDeskPhone: input.infoDeskPhone ?? null })
      .returning({ id: hospitals.id, name: hospitals.name });
    if (!row) throw new Error("No se pudo crear el hospital.");
    return row;
  }

  async update(id: string, changes: HospitalChanges): Promise<void> {
    const patch: HospitalChanges = {};
    if (changes.name !== undefined) patch.name = changes.name;
    if (changes.city !== undefined) patch.city = changes.city;
    if (changes.infoDeskPhone !== undefined) patch.infoDeskPhone = changes.infoDeskPhone;
    if (changes.active !== undefined) patch.active = changes.active;
    if (changes.test !== undefined) patch.test = changes.test;
    if (Object.keys(patch).length === 0) return;
    await this.db.update(hospitals).set(patch).where(eq(hospitals.id, id));
  }
}
