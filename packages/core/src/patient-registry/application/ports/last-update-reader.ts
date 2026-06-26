// Port de lectura: marca de tiempo de la última actualización de las listas.
export interface LastUpdateReader {
  // Fecha del registro de paciente más reciente, o null si no hay datos.
  lastUpdatedAt(): Promise<Date | null>;
}
