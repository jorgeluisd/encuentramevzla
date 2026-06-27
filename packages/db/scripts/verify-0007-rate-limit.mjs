// Verificación SANDBOX de la migración 0007 (rate-limit del RPC search_patient).
// Abre una transacción, aplica la migración, inserta pacientes SINTÉTICOS, ejerce
// el RPC y hace ROLLBACK: NADA persiste en prod. Vitest no alcanza SQL.
//
// Uso (desde packages/db, con .env de la raíz cargado):
//   set -a; . ../../.env; set +a
//   node scripts/verify-0007-rate-limit.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(__dirname, "../../../supabase/migrations/0007_search_patient_rate_limit.sql");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL en el entorno.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? "✅" : "❌"} ${name}`);
  if (!cond) failures++;
};

try {
  await sql.begin(async (tx) => {
    // 1) Aplica la migración 0007 dentro de la transacción.
    await tx.unsafe(readFileSync(MIGRATION, "utf8"));

    // 2) Datos sintéticos: hospital + paciente + ingreso con un nombre distintivo.
    const term = "zzqx enum verify";
    const [h] = await tx`
      INSERT INTO public.hospitals (name, info_desk_phone, active)
      VALUES ('Hosp Verify 0007', '0212-0000000', true) RETURNING id`;
    const [p] = await tx`
      INSERT INTO public.patients (normalized_name, status, is_minor)
      VALUES (${term}, 'admitted', false) RETURNING id`;
    await tx`
      INSERT INTO public.admissions (patient_id, hospital_id, status)
      VALUES (${p.id}, ${h.id}, 'admitted')`;

    const callRpc = async (clientHash) => {
      const rows = await tx`SELECT result FROM public.search_patient(${term}, ${clientHash})`;
      return rows.map((r) => r.result);
    };

    // 3) Cliente A: 30 búsquedas válidas + la 31 debe quedar rate-limited.
    const A = "client-hash-A";
    let lastOk = null;
    for (let i = 1; i <= 30; i++) lastOk = await callRpc(A);
    check("las primeras 30 búsquedas de A devuelven el hospital", Boolean(lastOk?.[0]?.hospital_name));
    check("ninguna de las 30 fue rate_limited", !lastOk?.some((r) => r?.rate_limited));

    const call31 = await callRpc(A);
    check("la búsqueda 31 de A devuelve rate_limited", call31[0]?.rate_limited === true);

    const call32 = await callRpc(A);
    check("A sigue bloqueado en la 32 (la propia 31 cuenta)", call32[0]?.rate_limited === true);

    // 4) Cliente B (otro hash): NO se ve afectado por el límite de A.
    const B = "client-hash-B";
    const callB = await callRpc(B);
    check("cliente B (distinto hash) no está limitado", Boolean(callB[0]?.hospital_name));
    check("cliente B tampoco recibe rate_limited", !callB.some((r) => r?.rate_limited));

    // 5) Sin client_hash (NULL): no aplica rate-limit (compat / sin contexto de IP).
    const callNull = await callRpc(null);
    check("sin client_hash no se aplica rate-limit", Boolean(callNull[0]?.hospital_name));

    // 6) El registro guarda client_hash y el tipo rate_limited.
    const [{ count: limitedRows }] = await tx`
      SELECT count(*)::int AS count FROM public.search_log
      WHERE client_hash = ${A} AND result_type = 'rate_limited'`;
    check("search_log registró filas rate_limited para A", limitedRows >= 1);

    // ROLLBACK explícito: nada de esto persiste.
    throw new Error("__ROLLBACK__");
  });
} catch (err) {
  if (err instanceof Error && err.message === "__ROLLBACK__") {
    console.log("\n↩️  ROLLBACK ejecutado: la BD quedó intacta.");
  } else {
    console.error("\n💥 Error inesperado (la tx hizo rollback igual):", err);
    failures++;
  }
} finally {
  await sql.end();
}

console.log(failures === 0 ? "\n🟢 GREEN: 0007 verificada." : `\n🔴 ${failures} fallo(s).`);
process.exit(failures === 0 ? 0 : 1);
