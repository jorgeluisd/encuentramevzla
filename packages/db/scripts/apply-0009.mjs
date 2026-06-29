// Aplica 0009 a PROD (índices de rendimiento, aditivos). One-off con OK explícito.
// CREATE INDEX IF NOT EXISTS => idempotente; tx por seguridad.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
const M = join(__dirname, "../../../supabase/migrations/0009_performance_indexes.sql");
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  await sql.begin(async (tx) => { await tx.unsafe(readFileSync(M, "utf8")); });
  console.log("✅ Migración 0009 aplicada (commit).");
  const idx = await sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'idx_patients_normalized_doc_number',
        'idx_admissions_patient_id',
        'idx_admissions_hospital_id',
        'idx_hospitals_active'
      )
    ORDER BY indexname`;
  console.log(`✅ índices presentes: ${idx.map((r) => r.indexname).join(", ")}`);
  console.log(idx.length === 4 ? "✅ los 4 índices existen" : "❌ faltan índices");
} catch (e) { console.error("💥 Error (rollback):", e); process.exitCode = 1; }
finally { await sql.end(); }
