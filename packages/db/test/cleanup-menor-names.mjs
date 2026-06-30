// Integración: la limpieza de 'menor' en nombres existentes quita la palabra exacta,
// recalcula name_tokens y marca is_minor=true; respeta 'menores'; omite vacíos.
//   node packages/db/test/cleanup-menor-names.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:54322/evzla_test";
const sql = postgres(TEST_URL, { prepare: false, max: 1, onnotice: () => {} });
const WORD = "\\ymenor\\y"; // '\ymenor\y' en el regex de Postgres (límite de palabra)
let failed = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log(`  ✅ ${name}`);
  else { failed++; console.log(`  ❌ ${name}\n     got:  ${g}\n     want: ${w}`); }
};

try {
  await sql.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE SCHEMA IF NOT EXISTS extensions;`);
  await sql.unsafe(readFileSync(join(__dirname, "../../../supabase/migrations/0001_init.sql"), "utf8"));
  for (const [n, t] of [
    ["acosta menor adriani", ["acosta", "adriani", "menor"]],
    ["moises menor", ["menor", "moises"]],
    ["maria menores", ["maria", "menores"]], // NO se toca (no es la palabra exacta)
    ["menor", ["menor"]], // quedaría vacío → se omite
  ]) {
    await sql`INSERT INTO public.patients (normalized_name, name_tokens, is_minor, status) VALUES (${n},${t},false,'admitted')`;
  }

  await sql.begin(async (tx) => {
    await tx`
      WITH cleaned AS (
        SELECT id, btrim(regexp_replace(regexp_replace(normalized_name, ${WORD}, ' ', 'g'), ' +', ' ', 'g')) AS nn
        FROM public.patients WHERE normalized_name ~ ${WORD}
      )
      UPDATE public.patients p
      SET normalized_name = c.nn,
          name_tokens = ARRAY(SELECT DISTINCT w FROM unnest(string_to_array(c.nn, ' ')) AS w WHERE w <> '' ORDER BY w),
          is_minor = true
      FROM cleaned c WHERE p.id = c.id AND c.nn <> ''`;
  });

  const get = async (like) => (await sql`SELECT normalized_name AS n, name_tokens AS t, is_minor AS m FROM public.patients WHERE normalized_name = ${like}`)[0];
  console.log("\n== cleanup 'menor' ==");
  eq("acosta menor adriani → acosta adriani + is_minor", await get("acosta adriani"), { n: "acosta adriani", t: ["acosta", "adriani"], m: true });
  eq("moises menor → moises + is_minor", await get("moises"), { n: "moises", t: ["moises"], m: true });
  eq("maria menores intacto (no es 'menor')", await get("maria menores"), { n: "maria menores", t: ["maria", "menores"], m: false });
  eq("'menor' solo se omite (no queda vacío)", await get("menor"), { n: "menor", t: ["menor"], m: false });

  console.log(failed === 0 ? "\n✅ TODOS verdes" : `\n❌ ${failed} fallo(s)`);
  process.exitCode = failed === 0 ? 0 : 1;
} catch (e) {
  console.error("💥", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
