import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { statusEnum, teamRoleEnum } from "./enums";

/**
 * Schema `public` — datos NO sensibles.
 * El rol anónimo NO recibe grants directos (ver supabase/migrations/0002_rls.sql).
 * El acceso público pasa SOLO por el RPC `public.search_patient`.
 */

export const hospitals = pgTable("hospitals", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  // Mesa de información: único teléfono que el buscador puede revelar.
  infoDeskPhone: text("info_desk_phone"),
  city: text("city"),
  active: boolean("active").notNull().default(true),
  // Creado al vuelo en una ingesta (no del catálogo oficial) → pendiente de que un
  // moderador confirme si es un hospital nuevo o una variante a fusionar (spec 0020 §4).
  provisional: boolean("provisional").notNull().default(false),
});

/**
 * hospital_aliases — nombres normalizados que apuntan a un hospital canónico. Hace
 * converger variantes ("H. Vargas" == "Hospital Vargas de Caracas") sin duplicar
 * hospitales. `alias_normalized` = normalizeHospitalName(...) (spec 0020, ADR-0005).
 */
export const hospitalAliases = pgTable("hospital_aliases", {
  aliasNormalized: text("alias_normalized").primaryKey(),
  hospitalId: uuid("hospital_id")
    .notNull()
    .references(() => hospitals.id),
});

/**
 * raw_rows — preserva el dato CRUDO de cada fila de Excel tal cual se subió.
 * `content_hash` da idempotencia (no reprocesar la misma fila dos veces).
 */
export const rawRows = pgTable("raw_rows", {
  id: uuid("id").defaultRandom().primaryKey(),
  fileId: uuid("file_id").notNull(),
  contentHash: text("content_hash").notNull().unique(),
  rawRow: jsonb("raw_row").notNull(),
  hospitalId: uuid("hospital_id").references(() => hospitals.id),
  uploadedBy: uuid("uploaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * patients — entidad paciente (NO se colapsa el hospital aquí; eso va en `admissions`).
 */
export const patients = pgTable("patients", {
  id: uuid("id").defaultRandom().primaryKey(),
  normalizedName: text("normalized_name").notNull(),
  // tokens del nombre para matching token-set (text[]).
  nameTokens: text("name_tokens").array(),
  age: integer("age"),
  docType: text("doc_type"),
  normalizedDocNumber: text("normalized_doc_number"),
  status: statusEnum("status").notNull().default("admitted"),
  isMinor: boolean("is_minor").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * admissions — relación paciente ↔ hospital en el tiempo. Varios ingresos por paciente
 * permiten modelar TRASLADOS sin perder el histórico.
 */
export const admissions = pgTable("admissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  patientId: uuid("patient_id")
    .notNull()
    .references(() => patients.id),
  hospitalId: uuid("hospital_id")
    .notNull()
    .references(() => hospitals.id),
  admittedAt: timestamp("admitted_at", { withTimezone: true }),
  status: statusEnum("status").notNull().default("admitted"),
  hasPublicNotes: boolean("has_public_notes").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * audit_log — append-only. Toda mutación deja rastro.
 */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: uuid("entity_id"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * team_members — allow-list del portal /admin. Solo emails con membresía ACTIVA
 * acceden. Se lee SIEMPRE server-side (Drizzle); anon/authenticated sin grants.
 */
export const teamMembers = pgTable("team_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Email en minúsculas: clave de unión con la sesión de Supabase Auth.
  email: text("email").notNull().unique(),
  role: teamRoleEnum("role").notNull(),
  // nullable: un moderador puede ser global (sin hospital fijo).
  hospitalId: uuid("hospital_id").references(() => hospitals.id),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * search_log — anti-enumeración. Guardamos SOLO el HASH del término, nunca el texto.
 */
export const searchLog = pgTable("search_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  termHash: text("term_hash").notNull(),
  resultType: text("result_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
