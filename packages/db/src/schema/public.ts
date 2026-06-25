import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { estadoEnum } from "./enums";

/**
 * Schema `public` — datos NO sensibles.
 * El rol anónimo NO recibe grants directos (ver supabase/migrations/0002_rls.sql).
 * El acceso público pasa SOLO por el RPC `public.buscar_paciente`.
 */

export const hospitales = pgTable("hospitales", {
  id: uuid("id").defaultRandom().primaryKey(),
  nombre: text("nombre").notNull(),
  // Mesa de información: único teléfono que el buscador puede revelar.
  telefonoMesaInfo: text("telefono_mesa_info"),
  ciudad: text("ciudad"),
  activo: boolean("activo").notNull().default(true),
});

/**
 * staging_filas — preserva el dato CRUDO de cada fila de Excel tal cual se subió.
 * `content_hash` da idempotencia (no reprocesar la misma fila dos veces).
 */
export const stagingFilas = pgTable("staging_filas", {
  id: uuid("id").defaultRandom().primaryKey(),
  archivoId: uuid("archivo_id").notNull(),
  contentHash: text("content_hash").notNull().unique(),
  filaCruda: jsonb("fila_cruda").notNull(),
  hospitalId: uuid("hospital_id").references(() => hospitales.id),
  subidoPor: uuid("subido_por"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * personas — entidad persona (NO se colapsa el hospital aquí; eso va en `ingresos`).
 */
export const personas = pgTable("personas", {
  id: uuid("id").defaultRandom().primaryKey(),
  nombreNormalizado: text("nombre_normalizado").notNull(),
  // tokens del nombre para matching token-set (text[]).
  tokensNombre: text("tokens_nombre").array(),
  edad: integer("edad"),
  docTipo: text("doc_tipo"),
  docNumeroNormalizado: text("doc_numero_normalizado"),
  estado: estadoEnum("estado").notNull().default("ingresado"),
  esMenor: boolean("es_menor").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * ingresos — relación persona ↔ hospital en el tiempo. Varios ingresos por persona
 * permiten modelar TRASLADOS sin perder el histórico.
 */
export const ingresos = pgTable("ingresos", {
  id: uuid("id").defaultRandom().primaryKey(),
  personaId: uuid("persona_id")
    .notNull()
    .references(() => personas.id),
  hospitalId: uuid("hospital_id")
    .notNull()
    .references(() => hospitales.id),
  fechaIngreso: timestamp("fecha_ingreso", { withTimezone: true }),
  estado: estadoEnum("estado").notNull().default("ingresado"),
  observacionesPublicasFlag: boolean("observaciones_publicas_flag")
    .notNull()
    .default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * audit_log — append-only. Toda mutación deja rastro.
 */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: uuid("actor_id"),
  accion: text("accion").notNull(),
  entidad: text("entidad").notNull(),
  entidadId: uuid("entidad_id"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * busqueda_log — anti-enumeración. Guardamos SOLO el HASH del término, nunca el texto.
 */
export const busquedaLog = pgTable("busqueda_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  terminoHash: text("termino_hash").notNull(),
  resultadoTipo: text("resultado_tipo").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
