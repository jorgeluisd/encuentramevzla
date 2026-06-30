// Aplica 0012 a PROD (índice GIN sobre patients.name_tokens). One-off con OK explícito.
// Aditivo / idempotente (CREATE INDEX IF NOT EXISTS).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
const M = join(__dirname, "../../../supabase/migrations/0012_patients_name_tokens_index.sql");
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  await sql.begin(async (tx) => { await tx.unsafe(readFileSync(M, "utf8")); });
  console.log("✅ Migración 0012 aplicada (commit).");
  const idx = await sql`SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_patients_name_tokens'`;
  console.log(idx[0] ? "✅ idx_patients_name_tokens existe" : "❌ índice no encontrado");
} catch (e) { console.error("💥 Error (rollback):", e); process.exitCode = 1; }
finally { await sql.end(); }
