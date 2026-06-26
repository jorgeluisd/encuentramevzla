import { sql } from "drizzle-orm";
import { patients } from "@evzla/db";
import type { getDb } from "@evzla/db/client";
import type { LastUpdateReader } from "@evzla/core";

type Db = ReturnType<typeof getDb>;

/**
 * Última actualización de las listas = registro de paciente más reciente.
 * Robusto sin importar cómo entró la data (ingesta por app o recarga por SQL).
 */
export class DrizzleLastUpdateReader implements LastUpdateReader {
  constructor(private readonly db: Db) {}

  async lastUpdatedAt(): Promise<Date | null> {
    // El agregado puede volver como string desde el driver; normaliza a Date real.
    const [row] = await this.db
      .select({ last: sql<string | Date | null>`max(${patients.createdAt})` })
      .from(patients);
    if (row?.last == null) return null;
    return row.last instanceof Date ? row.last : new Date(row.last);
  }
}
