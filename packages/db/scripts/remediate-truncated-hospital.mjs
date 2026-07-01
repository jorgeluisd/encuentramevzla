// Consolida un hospital DUPLICADO por nombre truncado dentro del canónico. Caso detectado:
// "Hospital Ana Francisca Pérez de" (truncado) es el mismo que "Hospital Ana Francisca Pérez de
// León" (completo, en la verdad); sus pacientes ya tienen ingreso en el completo.
//
// Mecánica (ADR-0007, DRY-RUN por defecto; --apply escribe):
//   1) Re-apunta los ingresos del truncado al completo.
//   2) Colapsa ingresos duplicados por paciente (mismo hospital → uno; repunta notas clínicas).
//   3) Desactiva el hospital truncado (active=false). No borra la fila (puede tener FKs).
//
// Uso: DATABASE_URL=<url> node packages/db/scripts/remediate-truncated-hospital.mjs [--apply]
import postgres from "postgres";
import { banner, connectionFromEnv, parseFlags } from "./_dedup-lib.mjs";

const TRUNC_NAME = "Hospital Ana Francisca Pérez de";
const FULL_NAME = "Hospital Ana Francisca Pérez de León";

// Colapsa ingresos duplicados del mismo hospital en un paciente (repunta notas clínicas).
async function collapseAdms(tx, pid) {
  const rows = await tx`
    SELECT id, hospital_id FROM public.admissions WHERE patient_id=${pid}
    ORDER BY hospital_id, created_at ASC, id ASC`;
  const kept = new Map();
  let removed = 0;
  for (const a of rows) {
    const k = kept.get(a.hospital_id);
    if (!k) { kept.set(a.hospital_id, a.id); continue; }
    await tx`UPDATE sensitive.clinical_notes SET admission_id=${k} WHERE admission_id=${a.id}`;
    await tx`DELETE FROM public.admissions WHERE id=${a.id}`;
    removed++;
  }
  return removed;
}

const { apply } = parseFlags(process.argv);
const { url, isLocal } = connectionFromEnv();
const sql = postgres(url, { prepare: false, max: 1 });

try {
  banner(`Consolidar hospital truncado → "${FULL_NAME}"`, { apply, isLocal });

  const [trunc] = await sql`SELECT id, active FROM public.hospitals WHERE name=${TRUNC_NAME}`;
  const [full] = await sql`SELECT id FROM public.hospitals WHERE name=${FULL_NAME}`;
  if (!trunc || !full) throw new Error("No se encontraron el hospital truncado y/o el completo.");

  // Pacientes con ingreso en el truncado y si ya lo tienen en el completo.
  const affected = await sql`
    SELECT DISTINCT p.id, p.normalized_name AS name,
      EXISTS (SELECT 1 FROM public.admissions a WHERE a.patient_id=p.id AND a.hospital_id=${full.id}) AS in_full
    FROM public.patients p
    JOIN public.admissions a ON a.patient_id=p.id
    WHERE a.hospital_id=${trunc.id}
    ORDER BY p.normalized_name`;
  const [{ adms }] = await sql`SELECT count(*)::int AS adms FROM public.admissions WHERE hospital_id=${trunc.id}`;

  // Referencias que impedirían borrar la fila (por eso desactivamos, no borramos).
  const [{ tm }] = await sql`SELECT count(*)::int AS tm FROM public.team_members WHERE hospital_id=${trunc.id}`;
  const [{ al }] = await sql`SELECT count(*)::int AS al FROM public.hospital_aliases WHERE hospital_id=${trunc.id}`;

  console.log(`Truncado: "${TRUNC_NAME}" id=${trunc.id} active=${trunc.active}`);
  console.log(`Completo: "${FULL_NAME}" id=${full.id}`);
  console.log(`\nIngresos en el truncado: ${adms} · pacientes afectados: ${affected.length}`);
  console.log(`  de esos, YA con ingreso en el completo (su ingreso truncado es duplicado): ${affected.filter((r) => r.in_full).length}`);
  console.log(`  sin ingreso previo en el completo (se les reasigna limpio): ${affected.filter((r) => !r.in_full).length}`);
  console.log(`Referencias del truncado → team_members: ${tm}, hospital_aliases: ${al} (por eso se DESACTIVA, no se borra)`);
  console.log("\n--- pacientes ---");
  for (const r of affected) console.log(`  "${r.name}" ${r.in_full ? "(ya en completo → colapsa)" : "(reasignado)"}`);

  if (!apply) {
    console.log("\nDRY-RUN: nada escrito. Repetí con --apply.");
  } else {
    let collapsed = 0;
    await sql.begin(async (tx) => {
      await tx`UPDATE public.admissions SET hospital_id=${full.id} WHERE hospital_id=${trunc.id}`;
      for (const r of affected) collapsed += await collapseAdms(tx, r.id);
      await tx`UPDATE public.hospitals SET active=false WHERE id=${trunc.id}`;
      await tx`INSERT INTO public.audit_log (action, entity, entity_id, payload)
               VALUES ('hospital_merged','hospital',${trunc.id}, ${tx.json({ into: full.id, name: TRUNC_NAME, via: "truncated-name-remediation" })})`;
    });
    console.log(`\n✅ Ingresos reapuntados al completo · duplicados colapsados: ${collapsed} · truncado desactivado.`);
  }

  // Estado final (siempre).
  const [{ left }] = await sql`SELECT count(*)::int AS left FROM public.admissions WHERE hospital_id=${trunc.id}`;
  const [hospNow] = await sql`SELECT active FROM public.hospitals WHERE id=${trunc.id}`;
  console.log("\n=== estado del hospital truncado ===");
  console.log(`  active: ${hospNow.active} · ingresos que aún lo referencian: ${left}`);
} catch (e) {
  console.error("💥", e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
