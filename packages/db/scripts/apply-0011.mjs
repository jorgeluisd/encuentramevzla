// Aplica 0011 a PROD (CREATE OR REPLACE de search_patient con pre-filtro trigram).
// One-off con OK explícito. Un solo statement => atómico. NO cambia resultados
// (verificado con golden tests + EXPLAIN en Postgres local; ver packages/db/test/).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
const M = join(__dirname, "../../../supabase/migrations/0011_search_patient_trigram.sql");
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  await sql.begin(async (tx) => { await tx.unsafe(readFileSync(M, "utf8")); });
  console.log("✅ Migración 0011 aplicada (commit).");
  const def = await sql`SELECT pg_get_functiondef('public.search_patient(text,text)'::regprocedure) AS d`;
  console.log(/%>/.test(def[0].d) ? "✅ pre-filtro trigram (%>) presente en prod" : "❌ pre-filtro NO presente");
} catch (e) { console.error("💥 Error (rollback):", e); process.exitCode = 1; }
finally { await sql.end(); }
