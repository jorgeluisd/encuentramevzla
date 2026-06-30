// Datos de un hospital recién creado.
export interface CreatedHospital {
  id: string;
  name: string;
}

// Port de alta de hospitales (reemplaza el alta manual en DB, D13). Solo lo usa el global.
export interface HospitalAdmin {
  create(input: { name: string; city?: string | null; infoDeskPhone?: string | null }): Promise<CreatedHospital>;
}
