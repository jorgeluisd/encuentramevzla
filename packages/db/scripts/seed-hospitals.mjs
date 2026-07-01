// Seed del CATÁLOGO CANÓNICO de hospitales + alias (spec 0020, ADR-0005).
// Aditivo e idempotente: NUNCA borra. Marca los canónicos como provisional=false y
// registra sus alias normalizados para que las ingestas converjan al id correcto.
// Uso: DATABASE_URL=<url> node packages/db/scripts/seed-hospitals.mjs
//
// Reconcilia variantes EXISTENTES solo por igualdad de nombre normalizado; la fusión
// difusa de duplicados ya cargados es tarea de la remediación (Fase G).
import postgres from "postgres";

// Réplica en JS de @evzla/core normalizeHospitalName (el core es TS; el script es .mjs).
const GENERIC = new Set(["hospital", "hosp", "h", "clinica", "centro", "ambulatorio", "cdi"]);
function normalizeHospitalName(raw) {
  const base = raw
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

// Catálogo inicial (CURAR con Jorge). `aliases` = grafías alternativas frecuentes.
const CATALOG = [
  { name: "Hospital Domingo Luciani", city: "Caracas", aliases: ["Domingo Luciani"] },
  { name: "Hospital Universitario de Caracas", city: "Caracas", aliases: ["HUC", "Universitario de Caracas"] },
  { name: "Hospital Pérez Carreño", city: "Caracas", aliases: ["Perez Carreno"] },
  { name: "Hospital Vargas de Caracas", city: "Caracas", aliases: ["Vargas", "H. Vargas"] },
  { name: "Hospital Militar Universitario Dr. Carlos Arvelo", city: "Caracas", aliases: ["Militar", "Carlos Arvelo"] },
  { name: "Hospital Ricardo Baquero González", city: "Caracas", aliases: ["Ricardo Baquero Gonzalez"] },
  { name: "Periférico de Catia", city: "Caracas", aliases: ["Periferico de Catia"] },
  { name: "Cruz Roja", city: "Caracas", aliases: [] },
  { name: "Campo de Golf Caribe", city: "La Guaira", aliases: [] },
  { name: "Centro de Acopio Caraballeda", city: "La Guaira", aliases: [] },
  { name: "Polideportivo La Guaira", city: "La Guaira", aliases: [] },
];

const URL = process.env.DATABASE_URL;
if (!URL) {
  console.error("⛔ Falta DATABASE_URL.");
  process.exit(1);
}

const sql = postgres(URL, { prepare: false, max: 1 });
try {
  for (const h of CATALOG) {
    const norm = normalizeHospitalName(h.name);

    // ¿Ya existe? Por alias o por nombre normalizado idéntico.
    const [byAlias] = await sql`
      SELECT hospital_id AS id FROM public.hospital_aliases WHERE alias_normalized = ${norm} LIMIT 1
    `;
    let id = byAlias?.id;
    if (!id) {
      const all = await sql`SELECT id, name FROM public.hospitals`;
      id = all.find((r) => normalizeHospitalName(r.name) === norm)?.id;
    }

    if (id) {
      await sql`
        UPDATE public.hospitals SET provisional = false, city = COALESCE(city, ${h.city ?? null})
        WHERE id = ${id}
      `;
    } else {
      const [row] = await sql`
        INSERT INTO public.hospitals (name, city, provisional) VALUES (${h.name}, ${h.city ?? null}, false)
        RETURNING id
      `;
      id = row.id;
    }

    const aliases = new Set(
      [norm, ...h.aliases.map(normalizeHospitalName)].filter((a) => a !== ""),
    );
    for (const a of aliases) {
      await sql`
        INSERT INTO public.hospital_aliases (alias_normalized, hospital_id)
        VALUES (${a}, ${id}) ON CONFLICT (alias_normalized) DO NOTHING
      `;
    }
    console.log(`✅ ${h.name} (${id}) · alias: ${[...aliases].join(", ")}`);
  }
  console.log(`\n${CATALOG.length} hospitales canónicos sembrados.`);
} catch (e) {
  console.error("💥", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
