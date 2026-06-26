import type { LastUpdateReader } from "../ports/last-update-reader";

// Caso de uso: devuelve la fecha de la última actualización de las listas (o null).
export class GetLastUpdate {
  constructor(private readonly reader: LastUpdateReader) {}

  execute(): Promise<Date | null> {
    return this.reader.lastUpdatedAt();
  }
}
