// Limpia marcadores de fallecimiento ("fallecido", "murio", "muerto"...) que hayan
// quedado escritos en el nombre de pacientes ya guardados. Por cada fila afectada:
// quita el marcador del nombre EXPUESTO, recalcula name_tokens y eleva el status a
// 'deceased' (la señal se conserva en un campo NO expuesto en claro, igual que en la
// ingesta). Si el nombre quedara vacío tras quitar el marcador, NO se toca (se avisa).
// Transacción única. One-off con OK explícito:
//   node --env-file=.env packages/db/scripts/strip-deceased-names.mjs
import postgres from "postgres";

// Mismo criterio que PersonName.normalize (packages/core .../person-name.ts): palabra
// exacta, sin diacríticos (el normalized_name ya viene sin acentos). No usa el stem
// suelto (fallec/muert) para no morder apellidos legítimos como "Murillo".
const DECEASED_MARK = /\b(fallecid[oa]s?|fallecio|murio|muert[oa]s?)\b/g;

const stripName = (normalized) => normalized.replace(DECEASED_MARK, " ").replace(/\s+/g, " ").trim();
const tokensOf = (name) => (name === "" ? [] : [...new Set(name.split(" "))].sort());

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  const rows = await sql`
    SELECT id, normalized_name, status FROM public.patients
    WHERE normalized_name ~* '\\m(fallecid[oa]s?|fallecio|murio|muert[oa]s?)\\M'`;
  if (rows.length === 0) {
    console.log("No hay nombres con marcador de fallecimiento. Nada que hacer.");
  } else {
    console.log(`Pacientes con marcador en el nombre: ${rows.length}`);
    let skipped = 0;
    await sql.begin(async (tx) => {
      for (const r of rows) {
        const cleaned = stripName(r.normalized_name);
        if (cleaned === "") {
          // El nombre era SOLO el marcador: no se puede dejar vacío un paciente real.
          console.log(`⚠️  ${r.id}: nombre quedaría vacío ("${r.normalized_name}") → se omite, revisar a mano.`);
          skipped++;
          continue;
        }
        console.log(
          `"${r.normalized_name}" → "${cleaned}"` +
            (r.status !== "deceased" ? `  [status ${r.status} → deceased]` : ""),
        );
        await tx`
          UPDATE public.patients
          SET normalized_name = ${cleaned},
              name_tokens = ${tokensOf(cleaned)}::text[],
              status = 'deceased'
          WHERE id = ${r.id}`;
      }
    });
    console.log(`\n✅ Limpieza aplicada (commit). Omitidos: ${skipped}.`);
  }
  const remain = await sql`
    SELECT count(*)::int AS n FROM public.patients
    WHERE normalized_name ~* '\\m(fallecid[oa]s?|fallecio|murio|muert[oa]s?)\\M'
      AND normalized_name <> ''`;
  const left = remain[0].n;
  console.log(left === 0 ? "✅ no quedan marcadores limpiables" : `❌ quedan ${left} (probablemente nombres-solo-marcador omitidos)`);
} catch (e) {
  console.error("💥 Error (rollback):", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
