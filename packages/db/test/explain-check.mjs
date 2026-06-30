// Verifica que el WHERE nuevo (0011) usa el índice GIN trigram y el viejo (0008) no.
// Siembra ~5000 pacientes para que el planner prefiera el índice, y compara el plan
// del predicado de nombre VIEJO vs NUEVO sobre la misma tabla.
import { connect, loadSchema, seed } from "./local-db.mjs";

const sql = connect();

// Predicado de nombre VIEJO (0008): word_similarity dentro de NOT EXISTS (no index-usable).
const whereOld = `
  NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['jorge','diaz']) AS tok
    WHERE p.normalized_name NOT ILIKE '%'||tok||'%'
      AND word_similarity(tok, p.normalized_name) < 0.6
  )`;

// Predicado de nombre NUEVO (0011): pre-filtro index-usable + mismo refinamiento.
const whereNew = `
  ( p.normalized_name ILIKE '%jorge%' OR p.normalized_name %> 'jorge' )
  AND NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['jorge','diaz']) AS tok
    WHERE p.normalized_name NOT ILIKE '%'||tok||'%'
      AND word_similarity(tok, p.normalized_name) < 0.6
  )`;

const planFor = async (where) => {
  const rows = await sql.unsafe(`EXPLAIN (FORMAT TEXT)
    SELECT p.id FROM public.patients p WHERE ${where}`);
  return rows.map((r) => r["QUERY PLAN"]).join("\n");
};

const usesTrgmIndex = (plan) => /idx_patients_normalized_name_trgm/.test(plan);
const seqScansPatients = (plan) => /Seq Scan on patients/.test(plan);

try {
  await loadSchema(sql, { searchMigration: "0011_search_patient_trigram.sql" });
  await seed(sql);
  // Volumen a escala realista para que el índice sea atractivo.
  await sql.unsafe(`INSERT INTO public.patients (normalized_name, normalized_doc_number, status)
    SELECT 'persona numero ' || g, 'V' || (1000000+g), 'admitted' FROM generate_series(1, 50000) g;`);
  await sql.unsafe(`SET pg_trgm.word_similarity_threshold = 0.6;`);
  await sql.unsafe(`ANALYZE public.patients;`);

  const oldPlan = await planFor(whereOld);
  const newPlan = await planFor(whereNew);
  await sql.unsafe(`SET enable_seqscan = off;`);
  const newForced = await planFor(whereNew);

  console.log("\n=== VIEJO (0008), 50k filas ===\n" + oldPlan);
  console.log("\n=== NUEVO (0011), 50k filas ===\n" + newPlan);
  console.log("\n=== NUEVO (0011) con enable_seqscan=off (prueba de usabilidad) ===\n" + newForced);

  // Éxito: el predicado nuevo es index-usable (lo elige a escala o al menos cuando se fuerza),
  // y el viejo nunca puede usar el índice.
  const newUsesIndex = usesTrgmIndex(newPlan) || usesTrgmIndex(newForced);
  const ok = !usesTrgmIndex(oldPlan) && newUsesIndex;
  console.log("\n--- veredicto ---");
  console.log(`viejo usa índice trgm:           ${usesTrgmIndex(oldPlan)} (esperado false)`);
  console.log(`nuevo usa índice (default 50k):   ${usesTrgmIndex(newPlan)}`);
  console.log(`nuevo usa índice (forzado):       ${usesTrgmIndex(newForced)} (esperado true)`);
  console.log(ok ? "\n✅ el nuevo SÍ puede usar el índice; el viejo NO" : "\n❌ no se cumple lo esperado");
  process.exitCode = ok ? 0 : 1;
} catch (e) {
  console.error("💥", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
