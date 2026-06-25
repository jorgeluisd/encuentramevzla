/**
 * @registro/db — esquema Drizzle del Registro Hospitalario.
 *
 * Recordatorio de diseño (innegociable):
 *  - Dos schemas Postgres: `public` (no sensible) y `sensible` (PII / clínico, aislado).
 *  - El rol anónimo NO accede a `sensible` ni a las tablas de datos de `public`.
 *  - El acceso público sucede SOLO vía el RPC `public.buscar_paciente` (SECURITY DEFINER).
 *
 * Las migraciones canónicas (extensiones, RLS, grants y RPC) viven en `supabase/migrations/`.
 */
export * as schema from "./schema/index";
export * from "./schema/index";

// Tipos de conveniencia para inferencia (select / insert) listos para usar en apps.
import type {
  hospitales,
  stagingFilas,
  personas,
  ingresos,
  auditLog,
  busquedaLog,
} from "./schema/public";
import type { contacto, observacionesClinicas } from "./schema/sensible";

export type Hospital = typeof hospitales.$inferSelect;
export type NuevoHospital = typeof hospitales.$inferInsert;
export type StagingFila = typeof stagingFilas.$inferSelect;
export type Persona = typeof personas.$inferSelect;
export type NuevaPersona = typeof personas.$inferInsert;
export type Ingreso = typeof ingresos.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
export type BusquedaLog = typeof busquedaLog.$inferSelect;
export type Contacto = typeof contacto.$inferSelect;
export type ObservacionClinica = typeof observacionesClinicas.$inferSelect;
