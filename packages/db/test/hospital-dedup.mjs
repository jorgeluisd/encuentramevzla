// Integración: consolidación de hospitales que solo difieren en mayúsculas.
// Mismo lookup case-insensitive que usa DrizzleHospitalRepository.resolveByName
// (lower(name)=lower(input)) + la lógica del script dedupe-hospitals.
//   node packages/db/test/hospital-dedup.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:54322/evzla_test";
const sql = postgres(TEST_URL, { prepare: false, max: 1, onnotice: () => {} });
let failed = 0;
const ok = (name, cond) => { if (cond) console.log(`  ✅ ${name}`); else { failed++; console.log(`  ❌ ${name}`); } };

try {
  await sql.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE SCHEMA IF NOT EXISTS extensions;`);
  await sql.unsafe(readFileSync(join(__dirname, "../../../supabase/migrations/0001_init.sql"), "utf8"));

  const [h1] = await sql`INSERT INTO public.hospitals (name) VALUES ('Campo de Golf Caribe') RETURNING id`;
  const [h2] = await sql`INSERT INTO public.hospitals (name) VALUES ('CAMPO DE GOLF CARIBE') RETURNING id`;
  const [p] = await sql`INSERT INTO public.patients (normalized_name, status) VALUES ('ana', 'admitted') RETURNING id`;
  await sql`INSERT INTO public.admissions (patient_id, hospital_id, status)
    VALUES (${p.id},${h1.id},'admitted'),(${p.id},${h1.id},'admitted'),(${p.id},${h2.id},'admitted')`;

  console.log("\n== hospital dedup ==");
  // 1) resolveByName case-insensitive: el lookup encuentra el existente con otra capitalización.
  const found = await sql`SELECT id FROM public.hospitals WHERE lower(name) = lower(${"campo de golf caribe"}) LIMIT 1`;
  ok("lookup case-insensitive encuentra el hospital existente", found.length === 1);

  // 2) dedupe: agrupa por lower(name), mantiene el de más admisiones, repuntea, borra el resto.
  await sql.begin(async (tx) => {
    const groups = await tx`SELECT lower(name) AS key FROM public.hospitals GROUP BY lower(name) HAVING count(*) > 1`;
    for (const g of groups) {
      const members = await tx`SELECT h.id, (SELECT count(*) FROM public.admissions a WHERE a.hospital_id=h.id)::int AS adm
        FROM public.hospitals h WHERE lower(h.name) = ${g.key} ORDER BY adm DESC, h.id ASC`;
      for (const d of members.slice(1)) {
        await tx`UPDATE public.admissions SET hospital_id = ${members[0].id} WHERE hospital_id = ${d.id}`;
        await tx`DELETE FROM public.hospitals WHERE id = ${d.id}`;
      }
    }
  });
  const remaining = await sql`SELECT name, (SELECT count(*)::int FROM public.admissions a WHERE a.hospital_id=h.id) AS adm FROM public.hospitals h`;
  ok("queda 1 solo hospital", remaining.length === 1);
  ok("conserva la capitalización legible 'Campo de Golf Caribe'", remaining[0]?.name === "Campo de Golf Caribe");
  ok("las 3 admisiones quedan en el canónico", remaining[0]?.adm === 3);

  console.log(failed === 0 ? "\n✅ TODOS verdes" : `\n❌ ${failed} fallo(s)`);
  process.exitCode = failed === 0 ? 0 : 1;
} catch (e) {
  console.error("💥", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
