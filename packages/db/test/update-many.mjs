// Integración: el UPDATE ... FROM (VALUES ...) + COALESCE de updateMany (anti-N+1)
// aplica SOLO los campos provistos y conserva el resto. node packages/db/test/update-many.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIG = (f) => readFileSync(join(__dirname, "../../../supabase/migrations", f), "utf8");
const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:54322/evzla_test";
const sql = postgres(TEST_URL, { prepare: false, max: 1, onnotice: () => {} });

let failed = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log(`  ✅ ${name}`);
  else { failed++; console.log(`  ❌ ${name}\n     got:  ${g}\n     want: ${w}`); }
};

try {
  await sql.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE SCHEMA IF NOT EXISTS extensions;`);
  await sql.unsafe(MIG("0001_init.sql"));

  const [p1] = await sql`INSERT INTO public.patients (normalized_name, normalized_doc_number, is_minor, status)
    VALUES ('ana', 'V1', false, 'admitted') RETURNING id`;
  const [p2] = await sql`INSERT INTO public.patients (normalized_name, normalized_doc_number, is_minor, status)
    VALUES ('bob', NULL, false, 'admitted') RETURNING id`;

  // p1: solo status (doc/minor NULL = conservar). p2: doc + isMinor (status NULL = conservar).
  await sql`
    UPDATE public.patients AS p SET
      normalized_doc_number = COALESCE(v.doc, p.normalized_doc_number),
      is_minor = COALESCE(v.is_minor, p.is_minor),
      status = COALESCE(v.status, p.status)
    FROM (VALUES
      (${p1.id}::uuid, ${null}::text, ${null}::boolean, ${"deceased"}::public.person_status),
      (${p2.id}::uuid, ${"V2"}::text, ${true}::boolean, ${null}::public.person_status)
    ) AS v(id, doc, is_minor, status)
    WHERE p.id = v.id`;

  const [r1] = await sql`SELECT normalized_doc_number AS doc, is_minor AS minor, status FROM public.patients WHERE id=${p1.id}`;
  const [r2] = await sql`SELECT normalized_doc_number AS doc, is_minor AS minor, status FROM public.patients WHERE id=${p2.id}`;

  console.log("\n== updateMany batched (COALESCE) ==");
  eq("p1: status cambia, doc/minor se conservan", r1, { doc: "V1", minor: false, status: "deceased" });
  eq("p2: doc+minor cambian, status se conserva", r2, { doc: "V2", minor: true, status: "admitted" });

  console.log(failed === 0 ? "\n✅ TODOS verdes" : `\n❌ ${failed} fallo(s)`);
  process.exitCode = failed === 0 ? 0 : 1;
} catch (e) {
  console.error("💥", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
