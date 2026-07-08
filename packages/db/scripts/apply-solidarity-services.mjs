// Aplica a PROD las migraciones del directorio de servicios solidarios (spec 0023):
//   0016 (tabla + RLS + RPC list_solidarity_services + grant),
//   0017 (reported / reported_at / report_reason),
//   0018 (action_rate_log + índices trigram).
// Todas son ADITIVAS e idempotentes (IF NOT EXISTS / CREATE OR REPLACE) → seguras de
// re-aplicar y sin impacto sobre pacientes ni el buscador existente.
//
// Uso: DATABASE_URL=<url> node packages/db/scripts/apply-solidarity-services.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGS = [
  "0016_solidarity_services.sql",
  "0017_solidarity_services_report.sql",
  "0018_solidarity_rate_limit_and_trgm.sql",
];

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  for (const m of MIGS) {
    const path = join(__dirname, "../../../supabase/migrations", m);
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(path, "utf8"));
    });
    console.log(`✅ ${m} aplicada (commit).`);
  }

  // Verificación
  const tables = await sql`SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name IN ('solidarity_services','action_rate_log')`;
  console.log("tablas:", tables.map((r) => r.table_name).sort().join(", "));
  const cols = await sql`SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='solidarity_services'
      AND column_name IN ('reported','reported_at','report_reason')`;
  console.log("columnas reporte:", cols.map((r) => r.column_name).sort().join(", "));
  const rpc = await sql`SELECT 1 FROM pg_proc WHERE proname='list_solidarity_services'`;
  console.log("RPC list_solidarity_services:", rpc.length ? "presente" : "AUSENTE");
  const grant = await sql`SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_name='list_solidarity_services' AND grantee='anon'`;
  console.log("grant EXECUTE a anon:", grant.length ? "sí" : "NO");
  const idx = await sql`SELECT count(*)::int AS n FROM pg_indexes WHERE indexname LIKE 'solidarity_services_%trgm'`;
  console.log("índices trigram:", idx[0].n);
} catch (e) {
  console.error("💥 Error (rollback de la migración en curso):", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
