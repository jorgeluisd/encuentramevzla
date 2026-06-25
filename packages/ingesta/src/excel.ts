/**
 * Parseo de Excel con SheetJS (xlsx). Convierte un buffer de .xlsx/.xls en filas
 * crudas (objetos JSON) tal cual vienen, SIN normalizar ni mapear todavía: el dato
 * crudo se preserva en `staging_filas` para trazabilidad y derecho al olvido.
 */
import * as XLSX from "xlsx";

/** Una fila cruda de la hoja: claves = cabeceras del Excel, valores = celdas. */
export type FilaCruda = Record<string, unknown>;

export interface ResultadoParseo {
  /** Nombre de la hoja leída. */
  hoja: string;
  /** Filas crudas (intactas). */
  filas: FilaCruda[];
}

/**
 * Lee la PRIMERA hoja del libro y devuelve sus filas crudas.
 * STUB: aún no valida cabeceras ni hace mapeo a `personas`/`ingresos`; eso ocurre
 * después, en la ingesta server-side + worker de dedup.
 */
export function parsearExcel(buffer: ArrayBuffer | Uint8Array): ResultadoParseo {
  const wb = XLSX.read(buffer, { type: "array" });
  const nombreHoja = wb.SheetNames[0];
  if (!nombreHoja) {
    return { hoja: "", filas: [] };
  }
  const hoja = wb.Sheets[nombreHoja];
  if (!hoja) {
    return { hoja: nombreHoja, filas: [] };
  }
  const filas = XLSX.utils.sheet_to_json<FilaCruda>(hoja, { defval: null });
  return { hoja: nombreHoja, filas };
}

/**
 * Hash estable del contenido de una fila para idempotencia (-> staging_filas.content_hash).
 * STUB determinista (FNV-1a 32-bit) que NO usa crypto para mantener la lib pura y
 * sin dependencias de plataforma. En producción se usará un hash criptográfico.
 */
export function contentHash(fila: FilaCruda): string {
  const json = JSON.stringify(fila, Object.keys(fila).sort());
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
