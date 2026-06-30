// Limpieza one-off: pacientes ingestados antes de #53 con la palabra "menor" en el
// nombre. Quita la palabra EXACTA "menor" del normalized_name, recalcula name_tokens
// y marca is_minor=true (la señal se conserva en el campo NO expuesto). En transacción.
// No toca "menores"/"menorca". Si el nombre quedara vacío, se OMITE (no rompe el dato).
//   node --env-file=.env packages/db/scripts/cleanup-menor-names.mjs
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, onnotice: () => {} });
// '\\ymenor\\y' en JS => '\ymenor\y' en el string => límite de palabra en el regex de Postgres.
const WORD = "\\ymenor\\y";
try {
  const before = await sql`SELECT count(*)::int AS n FROM public.patients WHERE normalized_name ~ ${WORD}`;
  console.log("pacientes con 'menor' (palabra):", before[0].n);

  // Riesgo: nombres que quedarían VACÍOS tras quitar 'menor' (no debería haber).
  const empties = await sql`
    SELECT id, normalized_name FROM public.patients
    WHERE normalized_name ~ ${WORD}
      AND btrim(regexp_replace(regexp_replace(normalized_name, ${WORD}, ' ', 'g'), ' +', ' ', 'g')) = ''`;
  if (empties.length > 0) {
    console.log(`⚠️ ${empties.length} quedarían vacíos → se OMITEN:`, empties.map((e) => e.normalized_name));
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
      FROM cleaned c
      WHERE p.id = c.id AND c.nn <> ''`;
  });
  console.log("✅ Limpieza aplicada (commit).");

  const after = await sql`SELECT count(*)::int AS n FROM public.patients WHERE normalized_name ~ ${WORD}`;
  console.log("pacientes con 'menor' tras limpieza:", after[0].n, after[0].n === 0 ? "✅" : "(quedan: revisar los vacíos omitidos)");
} catch (e) {
  console.error("💥 Error (rollback):", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
