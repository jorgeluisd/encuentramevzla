// Datos de un hospital recién creado.
export interface CreatedHospital {
  id: string;
  name: string;
}

// Hospital completo para la vista de gestión (solo moderador).
export interface Hospital {
  id: string;
  name: string;
  city: string | null;
  infoDeskPhone: string | null;
  active: boolean; // false = fuera del buscador y del selector de carga.
  provisional: boolean; // creado al vuelo en una ingesta, pendiente de moderación.
  test: boolean; // hospital de prueba: excluido del buscador público (spec 0015).
}

// Cambios aplicables a un hospital. Campo ausente = no se toca.
export interface HospitalChanges {
  name?: string;
  city?: string | null;
  infoDeskPhone?: string | null;
  active?: boolean;
  test?: boolean;
}

// Port de gestión de hospitales (reemplaza el alta manual en DB, D13). Solo lo usa el moderador.
export interface HospitalAdmin {
  list(options?: { q?: string | null }): Promise<Hospital[]>;
  create(input: { name: string; city?: string | null; infoDeskPhone?: string | null }): Promise<CreatedHospital>;
  update(id: string, changes: HospitalChanges): Promise<void>;
}
