import type { Config } from "drizzle-kit";

// Drizzle Kit apunta al Postgres mediante DATABASE_URL.
// Las migraciones canónicas son SQL versionado en `supabase/migrations/` (nombre heredado;
// se aplican con evzla_owner). Este config solo genera diffs de TABLAS durante el desarrollo.
export default {
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  // Solo gestionamos estos schemas desde Drizzle; el resto se controla con SQL en supabase/migrations/.
  schemaFilter: ["public", "sensitive"],
  verbose: true,
  strict: true,
} satisfies Config;
