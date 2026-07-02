// Aplica 0015 a PROD (ALTER hospitals.test + CREATE OR REPLACE search_patient con
// `AND h.test = false`). One-off con OK explícito. La ALTER deja los hospitales
// existentes en test=false => NO cambia resultados de búsqueda de datos ya cargados.
// (Verificado con packages/db/test/search.exclude-test-hospital.mjs en Postgres local.)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
const M = join(__dirname, "../../../supabase/migrations/0015_search_patient_exclude_test.sql");
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  await sql.begin(async (tx) => { await tx.unsafe(readFileSync(M, "utf8")); });
  console.log("✅ Migración 0015 aplicada (commit).");
  const col = await sql`SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='hospitals' AND column_name='test'`;
  console.log(col.length ? "✅ columna hospitals.test presente" : "❌ columna NO presente");
  const def = await sql`SELECT pg_get_functiondef('public.search_patient(text,text)'::regprocedure) AS d`;
  console.log(/h\.test = false/.test(def[0].d) ? "✅ filtro h.test=false presente en el RPC" : "❌ filtro NO presente");
} catch (e) { console.error("💥 Error (rollback):", e); process.exitCode = 1; }
finally { await sql.end(); }
