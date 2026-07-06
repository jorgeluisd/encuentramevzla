// Taxonomía fija de servicios solidarios. Vive en el dominio (no `pgEnum`) para
// ampliarla sin migración de DB. "Otro" es la salida de escape (el detalle va en la descripción).
export const SERVICE_CATEGORIES = [
  "Salud y primeros auxilios",
  "Salud mental / apoyo psicológico",
  "Ingeniería y evaluación estructural",
  "Construcción y albañilería",
  "Electricidad",
  "Plomería / fontanería",
  "Búsqueda y rescate",
  "Legal y notarial",
  "Transporte y logística",
  "Alojamiento temporal",
  "Alimentación y agua",
  "Ropa y enseres",
  "Impresión 3D y fabricación",
  "Tecnología y conectividad",
  "Traducción y comunicaciones",
  "Cuidado infantil",
  "Cuidado de adultos mayores",
  "Veterinaria y mascotas",
  "Voluntariado general",
  "Otro",
] as const;

export type ServiceCategoryValue = (typeof SERVICE_CATEGORIES)[number];

export class ServiceCategory {
  private constructor(readonly value: string) {}

  static fromRaw(raw: string): ServiceCategory {
    return new ServiceCategory(raw.trim());
  }

  get isValid(): boolean {
    return (SERVICE_CATEGORIES as readonly string[]).includes(this.value);
  }
}
