// Marcadores de incertidumbre del transcriptor: `[?]` y `[ILEGIBLE]`. Se preserva el
// texto crudo (en la fila de staging) y se levanta un flag para poder cuantificarlos.

const UNCERTAINTY = /\[\s*\?\s*\]|\[\s*ilegible\s*\]/i;

export function textHasUncertaintyMarker(value: string): boolean {
  return UNCERTAINTY.test(value ?? "");
}

// True si CUALQUIER celda de la fila trae un marcador.
export function rowHasUncertaintyMarker(cells: readonly string[]): boolean {
  return cells.some((c) => textHasUncertaintyMarker(c));
}
