import { DocumentId } from "../../../patient-registry/domain/value-objects/document-id";

// Normalización de la celda CÉDULA del consolidado. Los centinelas textuales
// (`-`, `INFANTE`, `SIN CI`, `[Menor]`, `NPD`, `NO POSEE`, `S/D`…) NO son cédula:
// se llevan a `normalized = null`, pero si el centinela indica minoría de edad esa
// señal se preserva en `isMinorSentinel` (no se puede perder).

export interface CedulaCell {
  normalized: string | null; // forma prod-compatible (upper, [A-Z0-9]); null si no es válida
  isDocValid: boolean; // ≥ 6 dígitos (espejo de DocumentId.isValid / del RPC público)
  isMinorSentinel: boolean; // el texto decía INFANTE / [Menor] / MENOR
  wasSentinel: boolean; // había texto, pero no era una cédula válida
}

const MINOR_SENTINEL = /\b(infante|menor)\b/i;

export function normalizeCedulaCell(raw: string): CedulaCell {
  const text = (raw ?? "").trim();
  const isMinorSentinel = MINOR_SENTINEL.test(text);
  const doc = DocumentId.fromRaw(text);
  if (doc.isValid) {
    return { normalized: doc.normalized, isDocValid: true, isMinorSentinel, wasSentinel: false };
  }
  return { normalized: null, isDocValid: false, isMinorSentinel, wasSentinel: text !== "" };
}

// Clave de comparación de cédula: solo dígitos, sin ceros a la izquierda. Se aplica
// al comparar ambos lados (staging y prod guardan la forma prod-compatible; la igualdad
// tolera ceros de encabezado). Devuelve null si no llega a 6 dígitos.
export function cedulaMatchKey(normalizedDoc: string | null): string | null {
  if (!normalizedDoc) return null;
  const digits = normalizedDoc.replace(/\D/g, "").replace(/^0+/, "");
  return digits.length >= 6 ? digits : null;
}
