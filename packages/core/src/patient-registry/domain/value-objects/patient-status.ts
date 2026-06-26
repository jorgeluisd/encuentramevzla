// Estado de una persona/ingreso. El mapeo al enum SQL en español es de infraestructura.
export type PatientStatus =
  | "admitted"
  | "transferred"
  | "discharged"
  | "located"
  | "deceased";

const DECEASED_NOTE = /fallec|[óo]bito|deceso|muert|expir/i;

// Menor de edad: solo cuando la edad es conocida y < 18.
export function isMinorAge(age: number | null): boolean {
  return age !== null && age < 18;
}

// Heurística: el texto de observaciones sugiere fallecimiento.
export function looksDeceased(notes: string | null): boolean {
  return notes !== null && DECEASED_NOTE.test(notes);
}

// Caso sensible: no se entrega por buscador abierto (menor o fallecido).
export function requiresHumanContact(input: {
  isMinor: boolean;
  status: PatientStatus;
}): boolean {
  return input.isMinor || input.status === "deceased";
}
