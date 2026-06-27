// Aplica la migración 0007 a PROD de forma ATÓMICA (BEGIN…COMMIT): el DROP de la
// firma vieja y el CREATE de la nueva ocurren juntos, sin ventana sin función.
// One-off: ejecutar con OK explícito. Verifica el estado final tras el commit.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(__dirname, "../../../supabase/migrations/0007_search_patient_rate_limit.sql");

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

try {
  // sql.begin hace COMMIT si la callback resuelve, ROLLBACK si lanza.
  await sql.begin(async (tx) => {
    await tx.unsafe(readFileSync(MIGRATION, "utf8"));
  });
  console.log("✅ Migración 0007 aplicada (commit).");

  // Verificación post-commit del estado real.
  const fns = await sql`
    SELECT pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'search_patient'
    ORDER BY args`;
  console.log("Firmas de search_patient en prod:", fns.map((r) => r.args));

  const [col] = await sql`
    SELECT 1 AS ok FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'search_log' AND column_name = 'client_hash'`;
  console.log(col ? "✅ search_log.client_hash existe" : "❌ falta client_hash");
} catch (err) {
  console.error("💥 Error aplicando 0007 (la tx hizo rollback):", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
