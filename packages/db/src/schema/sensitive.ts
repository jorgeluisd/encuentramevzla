import { pgSchema, text, uuid } from "drizzle-orm/pg-core";

/**
 * Schema `sensitive` — AISLADO. Contiene PII y datos clínicos.
 *
 * REQUISITO INNEGOCIABLE: el rol anónimo (anon) NO tiene ningún grant sobre este schema.
 * Ninguna consulta del cliente público puede tocar estas tablas. El RPC
 * `public.search_patient` jamás devuelve datos de aquí.
 *
 * La separación FÍSICA público/sensitive es deliberada: aunque alguien comprometa el rol
 * anónimo, no alcanza este schema.
 */
export const sensitive = pgSchema("sensitive");

export const contacts = sensitive.table("contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  // FK lógica a public.patients.id (la integridad cruzada se refuerza en SQL).
  patientId: uuid("patient_id").notNull(),
  phone: text("phone"),
  address: text("address"),
});

export const clinicalNotes = sensitive.table("clinical_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  // FK lógica a public.admissions.id.
  admissionId: uuid("admission_id").notNull(),
  note: text("note"),
  arrivedWith: text("arrived_with"),
});
