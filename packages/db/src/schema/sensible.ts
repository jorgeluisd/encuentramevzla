import { pgSchema, text, uuid } from "drizzle-orm/pg-core";

/**
 * Schema `sensible` — AISLADO. Contiene PII y datos clínicos.
 *
 * REQUISITO INNEGOCIABLE: el rol anónimo (anon) NO tiene ningún grant sobre este schema.
 * Ninguna consulta del cliente público puede tocar estas tablas. El RPC
 * `public.buscar_paciente` jamás devuelve datos de aquí.
 *
 * La separación FÍSICA público/sensible es deliberada: aunque alguien comprometa el rol
 * anónimo, no alcanza este schema.
 */
export const sensible = pgSchema("sensible");

export const contacto = sensible.table("contacto", {
  id: uuid("id").defaultRandom().primaryKey(),
  // FK lógica a public.personas.id (la integridad cruzada se refuerza en SQL).
  personaId: uuid("persona_id").notNull(),
  telefono: text("telefono"),
  direccion: text("direccion"),
});

export const observacionesClinicas = sensible.table("observaciones_clinicas", {
  id: uuid("id").defaultRandom().primaryKey(),
  // FK lógica a public.ingresos.id.
  ingresoId: uuid("ingreso_id").notNull(),
  texto: text("texto"),
  llegoCon: text("llego_con"),
});
