import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Estado de una persona / ingreso dentro del sistema hospitalario.
 * - ingresado:  está en el hospital.
 * - trasladado: movido a otro hospital (genera un nuevo `ingreso`).
 * - alta:       dado de alta.
 * - localizado: la familia ya lo localizó (cierra el círculo).
 * - fallecido:  NO se devuelve por el buscador público -> requiere_contacto_humano.
 */
export const estadoEnum = pgEnum("estado_persona", [
  "ingresado",
  "trasladado",
  "alta",
  "localizado",
  "fallecido",
]);
