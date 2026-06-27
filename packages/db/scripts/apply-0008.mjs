// Aplica 0008 a PROD (CREATE OR REPLACE de search_patient, umbral 300/10min).
// One-off con OK explícito. Un solo statement => atómico por sí mismo.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
const M = join(__dirname, "../../../supabase/migrations/0008_search_patient_rate_limit_threshold.sql");
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  await sql.begin(async (tx) => { await tx.unsafe(readFileSync(M, "utf8")); });
  console.log("✅ Migración 0008 aplicada (commit).");
  const def = await sql`SELECT pg_get_functiondef('public.search_patient(text,text)'::regprocedure) AS d`;
  console.log(/c_max_requests\s+bigint\s*:=\s*300/.test(def[0].d) ? "✅ umbral en prod = 300/10min" : "❌ umbral NO es 300");
} catch (e) { console.error("💥 Error (rollback):", e); process.exitCode = 1; }
finally { await sql.end(); }
