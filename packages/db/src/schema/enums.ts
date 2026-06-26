import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Estado de un paciente / ingreso dentro del sistema hospitalario.
 * - admitted:    está en el hospital.
 * - transferred: movido a otro hospital (genera un nuevo `admission`).
 * - discharged:  dado de alta.
 * - located:     la familia ya lo localizó (cierra el círculo).
 * - deceased:    NO se devuelve por el buscador público -> requires_human_contact.
 */
export const statusEnum = pgEnum("person_status", [
  "admitted",
  "transferred",
  "discharged",
  "located",
  "deceased",
]);
