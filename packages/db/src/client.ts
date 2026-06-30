/**
 * Cliente Drizzle sobre conexión DIRECTA a Postgres (postgres.js + DATABASE_URL).
 *
 * ¿Por qué conexión directa y no supabase-js?
 *  - El schema `sensitive` NO está expuesto a la API (PostgREST), por diseño. La única
 *    forma de escribir ahí es por conexión directa de servidor.
 *  - La ingesta/admin/worker escriben por aquí; el PÚBLICO jamás usa este cliente
 *    (el público solo invoca el RPC mediado con la anon key).
 *
 * SOLO servidor: nunca importar desde un componente de cliente.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

let _sql: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Falta DATABASE_URL en el entorno del servidor.");
  }
  // prepare:false => compatible con el pooler de Supabase (pgbouncer, modo transacción).
  // En serverless cada instancia tiene su propio pool; los timeouts liberan conexiones
  // ociosas rápido y evitan colgarse si el pooler está saturado. `max` se deja bajo.
  _sql = postgres(url, { prepare: false, max: 5, idle_timeout: 20, connect_timeout: 10 });
  _db = drizzle(_sql, { schema });
  return _db;
}

export type Db = ReturnType<typeof getDb>;
export { schema };
