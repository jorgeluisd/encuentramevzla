// Harness de Postgres local de test (Docker, de usar y tirar). NO toca prod.
// Carga el esquema mínimo para probar el RPC search_patient y la ingesta:
// extensiones + tablas/índice (0001) + función (0008/0011) + índices (0009).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIG = (f) => join(__dirname, "../../../supabase/migrations", f);

export const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:54322/evzla_test";

export function connect() {
  return postgres(TEST_URL, { prepare: false, max: 1, onnotice: () => {} });
}

// Aplica el esquema desde cero. `searchMigration` permite alternar 0008 (actual) vs 0011 (nuevo).
export async function loadSchema(sql, { searchMigration = "0008_search_patient_rate_limit_threshold.sql" } = {}) {
  // Reset limpio.
  await sql.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;`);
  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS extensions;`);
  // Extensiones (en Supabase viven en `extensions`; aquí en public basta para search_path).
  await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`); // digest()
  // 0001 ya crea pg_trgm / fuzzystrmatch / unaccent.
  // El buscador solo necesita el índice trigram de 0001 (no las 0009).
  for (const f of [
    "0001_init.sql",
    "0007_search_patient_rate_limit.sql", // añade search_log.client_hash + índice
    searchMigration,
  ]) {
    await sql.unsafe(readFileSync(MIG(f), "utf8"));
  }
}

// Datos semilla deterministas para los golden tests del buscador.
export async function seed(sql) {
  const [h] = await sql`INSERT INTO public.hospitals (name, info_desk_phone, active)
    VALUES ('Hospital Central', '0212-5550000', true) RETURNING id`;
  const hid = h.id;
  // (nombre normalizado ya en minúsculas sin acentos, como los inserta la ingesta real)
  const people = [
    { name: "jorge diaz", doc: "V12345678" },
    { name: "julio diaz", doc: "V22222222" },
    { name: "jorge suarez", doc: "V33333333" },
    { name: "jose perez", doc: "V44444444" },
    { name: "ana maria rodriguez", doc: "V55555555" },
    { name: "ana gomez", doc: "V66666666" },
  ];
  for (const p of people) {
    const [row] = await sql`INSERT INTO public.patients (normalized_name, normalized_doc_number, status)
      VALUES (${p.name}, ${p.doc}, 'admitted') RETURNING id`;
    await sql`INSERT INTO public.admissions (patient_id, hospital_id, status)
      VALUES (${row.id}, ${hid}, 'admitted')`;
  }
}

// Ejecuta el RPC y devuelve los nombres de paciente que matchean (orden incluido).
export async function search(sql, term, clientHash = null) {
  const rows = await sql`SELECT result FROM public.search_patient(${term}, ${clientHash})`;
  return rows
    .map((r) => r.result)
    .filter((r) => r.patient_name)
    .map((r) => r.patient_name);
}
