import type { PatientStatus } from "../../domain/value-objects/patient-status";

// Item de la "lista en vivo" de la vista Cargar: lo cargado por un hospital, con IDs para
// poder editar. Incluye sensibles (server-side, scoped) para prefilling del panel de edición.
export interface HospitalPatientListItem {
  patientId: string;
  admissionId: string | null;
  fullName: string | null;
  documentNumber: string | null;
  age: number | null;
  status: PatientStatus;
  isMinor: boolean;
  phone: string | null;
  address: string | null;
  clinicalNotes: string | null;
}

// Consulta paginada y con búsqueda (por nombre o cédula) acotada a un hospital.
export interface HospitalPatientListQuery {
  hospitalId: string;
  search?: string | null; // filtra por nombre o cédula; vacío = sin filtro
  limit: number;
  offset: number;
}

// Una página de resultados + el total que matchea (para construir la paginación).
export interface HospitalPatientListPage {
  items: HospitalPatientListItem[];
  total: number;
}

// Port de LECTURA de la lista de un hospital. La implementación filtra por hospitalId
// (service_role); el scope lo controla quién pasa el hospitalId (página server-side).
export interface HospitalPatientListReader {
  listForHospital(query: HospitalPatientListQuery): Promise<HospitalPatientListPage>;
}
