// Aplica 0010 a PROD (retención de search_log vía pg_cron). One-off con OK explícito.
// Requiere pg_cron habilitado en el proyecto Supabase.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
const M = join(__dirname, "../../../supabase/migrations/0010_search_log_retention.sql");
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  await sql.begin(async (tx) => { await tx.unsafe(readFileSync(M, "utf8")); });
  console.log("✅ Migración 0010 aplicada (commit).");
  const job = await sql`SELECT schedule, command FROM cron.job WHERE jobname = 'purge-search-log'`;
  console.log(job[0]
    ? `✅ job 'purge-search-log' programado: ${job[0].schedule}`
    : "❌ job no encontrado");
} catch (e) { console.error("💥 Error (rollback):", e); process.exitCode = 1; }
finally { await sql.end(); }
