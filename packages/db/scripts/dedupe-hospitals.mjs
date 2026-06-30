// Consolida hospitales duplicados que solo difieren en mayúsculas/minúsculas.
// Por cada grupo (mismo lower(name)) mantiene el de MÁS admisiones (desempate: id
// menor), repuntea admissions/raw_rows al canónico y borra los demás. Transacción.
// One-off con OK explícito:  node --env-file=.env packages/db/scripts/dedupe-hospitals.mjs
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  const groups = await sql`
    SELECT lower(name) AS key FROM public.hospitals GROUP BY lower(name) HAVING count(*) > 1`;
  if (groups.length === 0) {
    console.log("No hay hospitales duplicados (case-insensitive). Nada que hacer.");
  } else {
    console.log(`Grupos duplicados: ${groups.length}`);
    await sql.begin(async (tx) => {
      for (const g of groups) {
        const members = await tx`
          SELECT h.id, h.name,
                 (SELECT count(*) FROM public.admissions a WHERE a.hospital_id = h.id)::int AS adm
          FROM public.hospitals h WHERE lower(h.name) = ${g.key}
          ORDER BY adm DESC, h.id ASC`;
        const canonical = members[0];
        const drops = members.slice(1);
        console.log(
          `\nMantener "${canonical.name}" (${canonical.adm} adm) ← ` +
            drops.map((d) => `"${d.name}" (${d.adm})`).join(", "),
        );
        for (const d of drops) {
          await tx`UPDATE public.admissions SET hospital_id = ${canonical.id} WHERE hospital_id = ${d.id}`;
          await tx`UPDATE public.raw_rows  SET hospital_id = ${canonical.id} WHERE hospital_id = ${d.id}`;
          await tx`DELETE FROM public.hospitals WHERE id = ${d.id}`;
        }
      }
    });
    console.log("\n✅ Dedupe aplicado (commit).");
  }
  const remain = await sql`
    SELECT lower(name) AS key FROM public.hospitals GROUP BY lower(name) HAVING count(*) > 1`;
  console.log(remain.length === 0 ? "✅ no quedan duplicados" : `❌ quedan ${remain.length} grupos`);
} catch (e) {
  console.error("💥 Error (rollback):", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
