import type { PatientStatus } from "@evzla/core";

// Mapeo entre el estado de dominio (inglés) y el enum SQL (español).
type DbStatus = "ingresado" | "trasladado" | "alta" | "localizado" | "fallecido";

const TO_DB: Record<PatientStatus, DbStatus> = {
  admitted: "ingresado",
  transferred: "trasladado",
  discharged: "alta",
  located: "localizado",
  deceased: "fallecido",
};

const FROM_DB: Record<DbStatus, PatientStatus> = {
  ingresado: "admitted",
  trasladado: "transferred",
  alta: "discharged",
  localizado: "located",
  fallecido: "deceased",
};

export function statusToDb(status: PatientStatus): DbStatus {
  return TO_DB[status];
}

export function statusFromDb(value: string): PatientStatus {
  return FROM_DB[value as DbStatus] ?? "admitted";
}
