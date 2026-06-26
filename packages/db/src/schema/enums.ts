import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Estado de un paciente / ingreso dentro del sistema hospitalario.
 * - admitted:    está en el hospital.
 * - transferred: movido a otro hospital (genera un nuevo `admission`).
 * - discharged:  dado de alta.
 * - located:     la familia ya lo localizó (cierra el círculo).
 * - deceased:    fallecido. Desde ADR-0003 también se muestra su ubicación en el buscador.
 */
export const statusEnum = pgEnum("person_status", [
  "admitted",
  "transferred",
  "discharged",
  "located",
  "deceased",
]);

/**
 * Rol del personal verificado en el portal /admin.
 * - uploader:  puede subir listas de pacientes.
 * - moderator: uploader + revisión humana / audit log (decide fusiones).
 */
export const teamRoleEnum = pgEnum("team_role", ["uploader", "moderator"]);
