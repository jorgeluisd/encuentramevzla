// T16 — Unificación de HOSPITALES variantes (spec 0020 §6, ADR-0005/0007).
// Agrupa por nombre normalizado; fusiona las variantes en un canónico, re-apuntando
// admissions / raw_rows / team_members / hospital_aliases, y deja rastro en audit_log.
// DRY-RUN por defecto; --apply escribe. Ensayar en dump antes de prod (ADR-0007).
// Uso: DATABASE_URL=<url> node packages/db/scripts/remediate-hospitals.mjs [--apply]
import postgres from "postgres";
import { banner, connectionFromEnv, normalizeHospitalName, parseFlags } from "./_dedup-lib.mjs";

const { apply } = parseFlags(process.argv);
const { url, isLocal } = connectionFromEnv();
const sql = postgres(url, { prepare: false, max: 1 });

// Canónico del grupo: no-provisional primero, luego el de más ingresos, luego id estable.
function pickSurvivor(group) {
  return [...group].sort(
    (a, b) =>
      Number(a.provisional) - Number(b.provisional) ||
      Number(b.admissions) - Number(a.admissions) ||
      a.id.localeCompare(b.id),
  )[0];
}

try {
  banner("T16 — Unificación de hospitales", { apply, isLocal });

  const rows = await sql`
    SELECT h.id, h.name, h.provisional, count(a.id) AS admissions
    FROM public.hospitals h
    LEFT JOIN public.admissions a ON a.hospital_id = h.id
    GROUP BY h.id, h.name, h.provisional
  `;
  const byNorm = new Map();
  for (const h of rows) {
    const key = normalizeHospitalName(h.name);
    if (!key) continue;
    let list = byNorm.get(key);
    if (!list) {
      list = [];
      byNorm.set(key, list);
    }
    list.push(h);
  }
  const groups = [...byNorm.entries()].filter(([, hs]) => hs.length > 1);

  if (groups.length === 0) {
    console.log("No hay variantes de hospital que unificar.");
  }

  for (const [key, hs] of groups) {
    const survivor = pickSurvivor(hs);
    const sources = hs.filter((h) => h.id !== survivor.id);
    console.log(`[${key}] sobrevive "${survivor.name}" (${survivor.id})`);
    for (const s of sources) console.log(`    ← fusiona "${s.name}" (${s.id}, ${s.admissions} ingresos)`);

    if (!apply) continue;

    await sql.begin(async (tx) => {
      for (const s of sources) {
        await tx`UPDATE public.admissions SET hospital_id = ${survivor.id} WHERE hospital_id = ${s.id}`;
        await tx`UPDATE public.raw_rows SET hospital_id = ${survivor.id} WHERE hospital_id = ${s.id}`;
        await tx`UPDATE public.team_members SET hospital_id = ${survivor.id} WHERE hospital_id = ${s.id}`;
        // Mover alias del source al survivor (sin pisar los del survivor) + registrar su nombre.
        await tx`
          INSERT INTO public.hospital_aliases (alias_normalized, hospital_id)
          SELECT alias_normalized, ${survivor.id} FROM public.hospital_aliases WHERE hospital_id = ${s.id}
          ON CONFLICT (alias_normalized) DO NOTHING
        `;
        await tx`
          INSERT INTO public.hospital_aliases (alias_normalized, hospital_id)
          VALUES (${normalizeHospitalName(s.name)}, ${survivor.id})
          ON CONFLICT (alias_normalized) DO NOTHING
        `;
        await tx`DELETE FROM public.hospital_aliases WHERE hospital_id = ${s.id}`;
        await tx`DELETE FROM public.hospitals WHERE id = ${s.id}`;
        await tx`
          INSERT INTO public.audit_log (action, entity, entity_id, payload)
          VALUES ('hospital_merged', 'hospital', ${survivor.id},
                  ${tx.json({ mergedFrom: s.id, mergedName: s.name })})
        `;
      }
      // Asegura el alias del propio survivor y lo marca canónico.
      await tx`
        INSERT INTO public.hospital_aliases (alias_normalized, hospital_id)
        VALUES (${key}, ${survivor.id}) ON CONFLICT (alias_normalized) DO NOTHING
      `;
      await tx`UPDATE public.hospitals SET provisional = false WHERE id = ${survivor.id}`;
    });
    console.log(`    ✅ unificado (${sources.length} variantes).`);
  }

  console.log(apply ? "\nHecho." : "\nDRY-RUN: nada escrito. Repetí con --apply (tras ensayo en dump).");
} catch (e) {
  console.error("💥", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
