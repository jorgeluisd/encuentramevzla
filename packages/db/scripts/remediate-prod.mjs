// Orquestador de la remediación (spec 0020 §6, ADR-0007). Corre los pasos en orden,
// muestra un DRY-RUN antes de cada paso que escribe y PIDE CONFIRMACIÓN por cada --apply.
// Read-only y dry-run no piden confirmación. Todo reversible (auditado).
//
// Uso: DATABASE_URL=<url> node packages/db/scripts/remediate-prod.mjs
import { spawnSync } from "node:child_process";
import readline from "node:readline/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { connectionFromEnv } from "./_dedup-lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { url, isLocal } = connectionFromEnv();
// Sin terminal interactiva (pipe/CI) no se puede confirmar → modo preview: solo lecturas
// y dry-runs, NUNCA aplica. Con TTY, confirma cada --apply.
const interactive = Boolean(process.stdin.isTTY);
const rl = interactive
  ? readline.createInterface({ input: process.stdin, output: process.stdout })
  : null;
const yes = (s) => {
  const t = s.trim().toLowerCase();
  return t === "si" || t === "sí";
};
async function askRaw(q) {
  if (!rl) {
    console.log(`${q}[no interactivo → NO]`);
    return "";
  }
  try {
    return (await rl.question(q)).trim();
  } catch {
    return "";
  }
}

function run(file, args = []) {
  console.log(`\n$ node ${file} ${args.join(" ")}`);
  // stdin en "ignore": los hijos no leen entrada; así el readline del orquestador
  // conserva el stdin (si lo heredaran, cerrarían la consola de confirmaciones).
  const res = spawnSync("node", [path.join(HERE, file), ...args], {
    stdio: ["ignore", "inherit", "inherit"],
    env: process.env,
  });
  if (res.status !== 0) throw new Error(`${file} salió con código ${res.status}`);
}

let allowApply = interactive; // sin TTY nunca aplica; en prod se reconfirma en main().

// Paso que escribe: primero dry-run (default), luego confirma y aplica.
async function applyStep(label, file, applyArgs = []) {
  console.log(`\n──────── ${label} ────────`);
  console.log("Previsualización (dry-run):");
  run(file); // sin --apply
  if (!allowApply) {
    console.log(`⏭  ${label}: preview solamente (no se aplica).`);
    return;
  }
  const ans = await askRaw(`¿Aplicar "${label}"? escribí "si" para aplicar, cualquier otra cosa para saltar: `);
  if (yes(ans)) {
    run(file, ["--apply", ...applyArgs]);
    console.log(`✅ ${label} aplicado.`);
  } else {
    console.log(`⏭  ${label} saltado.`);
  }
}

async function main() {
  console.log(`\n=== REMEDIACIÓN 0020 ===\nDESTINO: ${isLocal ? "LOCAL" : "⚠️  REMOTO/PROD"}`);

  // Prerrequisito: migración 0014 aplicada.
  const sql = postgres(url, { prepare: false, max: 1 });
  const [chk] = await sql`
    SELECT
      EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='hospitals' AND column_name='provisional') AS has_prov,
      EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='hospital_aliases') AS has_aliases
  `;
  await sql.end();
  if (!chk.has_prov || !chk.has_aliases) {
    console.error("\n⛔ Falta la migración 0014 (hospital_aliases / provisional). Aplicala antes de remediar.");
    rl?.close();
    process.exit(1);
  }

  if (!interactive) {
    console.log("\n(modo NO interactivo: solo lecturas + dry-runs; no se aplicará nada)");
  }

  // Doble confirmación si es prod (solo aplica en modo interactivo).
  if (allowApply && !isLocal) {
    const a = await askRaw('\n⚠️  Vas a operar sobre PROD. Escribí exactamente "APLICAR EN PROD" para continuar: ');
    const dump = a === "APLICAR EN PROD" ? await askRaw('¿Ya ensayaste en un dump de prod? (ADR-0007) escribí "si": ') : "";
    if (a !== "APLICAR EN PROD" || !yes(dump)) {
      console.log("No confirmado → modo preview: se corren lecturas y dry-runs, sin aplicar.");
      allowApply = false;
    }
  }

  // 1. Baseline read-only.
  console.log("\n──────── (1) Auditoría baseline (read-only) ────────");
  run("dedup-audit.mjs");

  // 2. Seed catálogo (siempre escribe; idempotente). Confirmar.
  console.log("\n──────── (2) Seed de hospitales canónicos ────────");
  if (allowApply && yes(await askRaw('¿Correr el seed de hospitales? (curá la lista antes) escribí "si": '))) {
    run("seed-hospitals.mjs");
    console.log("✅ Seed aplicado.");
  } else {
    console.log("⏭  Seed saltado (preview no aplica).");
  }

  // 3. Unificar hospitales.
  await applyStep("(3) Unificar hospitales", "remediate-hospitals.mjs");

  // 4. Re-auditar.
  console.log("\n──────── (4) Re-auditoría (read-only) ────────");
  run("dedup-audit.mjs");

  // 5. Fusión de pacientes (Tier 1; Tier 2 opcional por teléfono).
  console.log("\n──────── (5) Fusión de duplicados ────────");
  const phone = await askRaw('¿Incluir Tier 2 (teléfono)? escribí "si" para --with-phone: ');
  await applyStep("(5) Fusión de duplicados", "remediate-duplicates.mjs", yes(phone) ? ["--with-phone"] : []);

  // 6. Encolar duplicados existentes (opcional; la cola ya tiene backlog).
  await applyStep("(6) Encolar duplicados a revisión", "enqueue-existing-dups.mjs");

  // 7. Verificación final.
  console.log("\n──────── (7) Auditoría final (read-only) ────────");
  run("dedup-audit.mjs");

  console.log("\n=== Remediación terminada. ===");
  rl?.close();
}

main().catch((e) => {
  console.error("💥", e.message);
  rl?.close();
  process.exit(1);
});
