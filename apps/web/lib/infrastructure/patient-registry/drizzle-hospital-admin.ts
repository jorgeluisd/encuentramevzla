import { hospitals } from "@evzla/db";
import type { getDb } from "@evzla/db/client";
import type { CreatedHospital, HospitalAdmin } from "@evzla/core";

type Db = ReturnType<typeof getDb>;

// Alta de hospitales (D13) por conexión directa (service_role). Solo servidor.
export class DrizzleHospitalAdmin implements HospitalAdmin {
  constructor(private readonly db: Db) {}

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
}
