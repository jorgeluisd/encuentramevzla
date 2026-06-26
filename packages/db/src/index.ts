/**
 * @evzla/db — esquema Drizzle del Registro Hospitalario.
 *
 * Recordatorio de diseño (innegociable):
 *  - Dos schemas Postgres: `public` (no sensible) y `sensitive` (PII / clínico, aislado).
 *  - El rol anónimo NO accede a `sensitive` ni a las tablas de datos de `public`.
 *  - El acceso público sucede SOLO vía el RPC `public.search_patient` (SECURITY DEFINER).
 *
 * Las migraciones canónicas (extensiones, RLS, grants y RPC) viven en `supabase/migrations/`.
 */
export * as schema from "./schema/index";
export * from "./schema/index";

// Tipos de conveniencia para inferencia (select / insert) listos para usar en apps.
import type {
  hospitals,
  rawRows,
  patients,
  admissions,
  auditLog,
  searchLog,
} from "./schema/public";
import type { contacts, clinicalNotes } from "./schema/sensitive";

export type Hospital = typeof hospitals.$inferSelect;
export type NewHospital = typeof hospitals.$inferInsert;
export type RawRow = typeof rawRows.$inferSelect;
export type Patient = typeof patients.$inferSelect;
export type NewPatientRow = typeof patients.$inferInsert;
export type Admission = typeof admissions.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
export type SearchLogRow = typeof searchLog.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type ClinicalNote = typeof clinicalNotes.$inferSelect;
