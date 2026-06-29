// Integración (spec 0019): el prefiltro de candidatos de la ingesta es un SUPERCONJUNTO
// de lo que decideMatch puede fusionar/revisar. Replica el SQL del adapter Drizzle:
//   WHERE normalized_doc_number = ANY($docs) OR name_tokens && $tokens
//   node packages/db/test/candidate-prefilter.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIG = (f) => readFileSync(join(__dirname, "../../../supabase/migrations", f), "utf8");

// Postgres local de test (Docker, puerto 54322). NO toca prod.
const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:54322/evzla_test";
const sql = postgres(TEST_URL, { prepare: false, max: 1, onnotice: () => {} });
let failed = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify([...got].sort());
  const w = JSON.stringify([...want].sort());
  if (g === w) console.log(`  ✅ ${name}`);
  else { failed++; console.log(`  ❌ ${name}\n     got:  ${g}\n     want: ${w}`); }
};

// Mismo predicado que DrizzlePatientRepository.loadCandidates (arrayOverlaps + inArray).
const prefilter = async (docs, tokens) => {
  const rows = await sql`
    SELECT normalized_name FROM public.patients
    WHERE normalized_doc_number = ANY(${docs}::text[])
       OR name_tokens && ${tokens}::text[]`;
  return rows.map((r) => r.normalized_name);
};

try {
  await sql.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE SCHEMA IF NOT EXISTS extensions;`);
  await sql.unsafe(MIG("0001_init.sql"));
  await sql.unsafe(MIG("0012_patients_name_tokens_index.sql"));

  const people = [
    { name: "carlos mendoza", doc: "V24140952", tokens: ["carlos", "mendoza"] },
    { name: "rosa diaz", doc: "V99999999", tokens: ["rosa", "diaz"] },
    { name: "pedro gomez", doc: null, tokens: ["pedro", "gomez"] },
    { name: "juan perez", doc: null, tokens: ["juan", "perez"] },
  ];
  for (const p of people) {
    await sql`INSERT INTO public.patients (normalized_name, name_tokens, normalized_doc_number, status)
      VALUES (${p.name}, ${p.tokens}, ${p.doc}, 'admitted')`;
  }

  console.log("\n== prefiltro de candidatos (0019) ==");
  eq("match por cédula", await prefilter(["V24140952"], []), ["carlos mendoza"]);
  eq("match por token (carlos)", await prefilter([], ["carlos"]), ["carlos mendoza"]);
  eq("token compartido entre ruido", await prefilter([], ["mendoza", "zzz"]), ["carlos mendoza"]);
  // Typo en el 1er token: se salva por el OTRO token compartido (propiedad de superconjunto).
  eq("typo en un token (karlos mendoza)", await prefilter([], ["karlos", "mendoza"]), ["carlos mendoza"]);
  eq("sin solape → nada", await prefilter([], ["xavier"]), []);
  eq("OR cédula + token", await prefilter(["V24140952"], ["rosa"]), ["carlos mendoza", "rosa diaz"]);

  // Usabilidad del índice GIN a escala.
  await sql.unsafe(`INSERT INTO public.patients (normalized_name, name_tokens, status)
    SELECT 'persona ' || g, ARRAY['tok' || g], 'admitted' FROM generate_series(1, 20000) g;`);
  await sql.unsafe(`ANALYZE public.patients;`);
  const plan = (await sql.unsafe(`EXPLAIN (FORMAT TEXT)
    SELECT id FROM public.patients WHERE name_tokens && ARRAY['carlos']::text[]`))
    .map((r) => r["QUERY PLAN"]).join("\n");
  const usesIdx = /idx_patients_name_tokens/.test(plan);
  if (usesIdx) console.log("  ✅ usa idx_patients_name_tokens (GIN) a escala");
  else { failed++; console.log("  ❌ no usa el índice GIN\n" + plan); }

  console.log(failed === 0 ? "\n✅ TODOS verdes" : `\n❌ ${failed} fallo(s)`);
  process.exitCode = failed === 0 ? 0 : 1;
} catch (e) {
  console.error("💥", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
