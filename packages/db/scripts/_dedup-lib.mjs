// Helpers compartidos por los scripts de remediación (spec 0020, ADR-0007).
// Réplica en JS de las funciones puras de @evzla/core (los scripts son .mjs, el core es TS).
// Deben mantenerse en línea con packages/core/.../domain/services/hospital-name.ts.

const GENERIC = new Set(["hospital", "hosp", "h", "clinica", "centro", "ambulatorio", "cdi"]);

export function normalizeHospitalName(raw) {
  const base = String(raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base
    .split(" ")
    .filter((t) => t !== "" && !GENERIC.has(t))
    .join(" ");
}

// Cédula válida como señal fuerte: ≥ 6 dígitos (espejo de DocumentId.isValid).
export function isValidDoc(normalizedDoc) {
  if (!normalizedDoc) return false;
  return (String(normalizedDoc).match(/\d/g)?.length ?? 0) >= 6;
}

// Lee flags de CLI: --apply activa la escritura (por defecto DRY-RUN), --with-phone la tier 2.
export function parseFlags(argv) {
  const flags = new Set(argv.slice(2));
  return { apply: flags.has("--apply"), withPhone: flags.has("--with-phone") };
}

export function connectionFromEnv() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("⛔ Falta DATABASE_URL.");
    process.exit(1);
  }
  const isLocal = url.includes("127.0.0.1") || url.includes("localhost");
  return { url, isLocal };
}

export function banner(title, { apply, isLocal }) {
  console.log(`\n=== ${title} ===`);
  console.log(apply ? "MODO: APLICAR (escribe en la base)" : "MODO: DRY-RUN (no escribe nada)");
  console.log(`DESTINO: ${isLocal ? "LOCAL" : "⚠️  REMOTO/PROD"}\n`);
}
