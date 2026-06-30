import { asc, eq } from "drizzle-orm";
import { hospitals } from "@evzla/db";
import type { getDb } from "@evzla/db/client";

type Db = ReturnType<typeof getDb>;

export interface HospitalRef {
  id: string;
  name: string;
}

// Directorio de hospitales activos: cabecera (nombre) de la vista Cargar y selector del global.
export class DrizzleHospitalDirectory {
  constructor(private readonly db: Db) {}

  async listActive(): Promise<HospitalRef[]> {
    return this.db
      .select({ id: hospitals.id, name: hospitals.name })
      .from(hospitals)
      .where(eq(hospitals.active, true))
      .orderBy(asc(hospitals.name));
  }
}
