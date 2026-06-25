import type { Config } from "drizzle-kit";

// Drizzle Kit apunta al Postgres 16 de Supabase mediante DATABASE_URL.
// NOTA: las migraciones "de verdad" del producto viven como SQL versionado en
// `supabase/migrations/` (extensiones, schema `sensible`, RLS y el RPC SECURITY DEFINER
// no se expresan bien desde el generador de Drizzle). Este config sirve para
// generar diffs de las TABLAS del schema `public` durante el desarrollo.
export default {
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  // Solo gestionamos estos schemas desde Drizzle; el resto se controla con SQL en supabase/.
  schemaFilter: ["public", "sensible"],
  verbose: true,
  strict: true,
} satisfies Config;
