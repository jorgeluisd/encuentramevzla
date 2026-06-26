/**
 * Parseo de Excel con SheetJS (xlsx).
 *
 * El dato CRUDO se preserva (se sube a `staging_filas` intacto) para trazabilidad y
 * derecho al olvido. Pero el Excel real trae complicaciones que hay que resolver al leer:
 *  - Una hoja consolidada + una hoja por hospital. Elegimos la MEJOR hoja (la que más
 *    se parece al esquema de pacientes).
 *  - Filas "banner" (título, instrucción "use Ctrl+F") ANTES del encabezado real:
 *    detectamos la fila de encabezado en vez de asumir que es la primera.
 *  - Orden/ío de columnas variable: mapeamos por patrón de cabecera, no por posición.
 */
import * as XLSX from "xlsx";

/** Una fila cruda de la hoja: claves = cabeceras detectadas, valores = celdas. */
export type FilaCruda = Record<string, unknown>;

/** Registro de paciente ya mapeado a campos canónicos (sigue siendo dato de entrada). */
export interface RegistroPaciente {
  hospitalNombre: string | null;
  nombre: string | null;
  edad: number | null;
  /** Documento crudo tal cual viene (puede ser inválido/ausente). */
  docNumero: string | null;
  telefono: string | null;
  direccion: string | null;
  observaciones: string | null;
}

export interface ResultadoParseo {
  /** Nombre de la hoja elegida. */
  hoja: string;
  /** Cabeceras detectadas (fila de encabezado real). */
  headers: string[];
  /** Filas crudas (intactas), una por paciente. */
  filas: FilaCruda[];
}

/** Patrones de cabecera. Usan límites de palabra para evitar falsos positivos
 *  (p. ej. que "id" matchee dentro de "apellidos", o "ci" dentro de "dirección"). */
const PATRONES: Record<keyof Omit<RegistroPaciente, never>, RegExp> = {
  hospitalNombre: /\bhospital\b|\bcentro\b|\bclinica\b|\bcl[ií]nica\b/i,
  nombre: /apellid|nombre|paciente/i,
  edad: /\bedad\b|\ba[nñ]os\b/i,
  docNumero: /\bc[eé]dula\b|\bdocumento\b|\bc\.?i\.?\b|\bid\b|\bdni\b/i,
  telefono: /\btel[eé]fono\b|\btel[eé]f\b|\btel\b|\bcelular\b|\bm[oó]vil\b/i,
  direccion: /\bdirecci[oó]n\b|\bdomicilio\b|\bdirec\b/i,
  observaciones: /observ|diagn[oó]st|\bnotas?\b/i,
};

const CAMPOS = Object.keys(PATRONES) as (keyof RegistroPaciente)[];

/** Cuántos campos canónicos reconoce una fila de celdas (para puntuar encabezados). */
function puntuarComoEncabezado(celdas: string[]): number {
  return CAMPOS.reduce(
    (acc, campo) => (celdas.some((c) => PATRONES[campo].test(c)) ? acc + 1 : acc),
    0,
  );
}

/** Lee una hoja como matriz (array de arrays), sin asumir dónde está el encabezado. */
function hojaAMatriz(ws: XLSX.WorkSheet): string[][] {
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    blankrows: false,
  });
  return matriz.map((fila) => (fila ?? []).map((c) => (c == null ? "" : String(c))));
}

/** Localiza la fila de encabezado (la de mayor puntaje en las primeras filas). */
function encontrarEncabezado(matriz: string[][]): number {
  let mejorIdx = 0;
  let mejor = -1;
  const limite = Math.min(matriz.length, 15);
  for (let r = 0; r < limite; r++) {
    const score = puntuarComoEncabezado(matriz[r] ?? []);
    if (score > mejor) {
      mejor = score;
      mejorIdx = r;
    }
  }
  return mejorIdx;
}

/**
 * Parsea el libro y devuelve las filas de pacientes de la MEJOR hoja:
 * elige la hoja cuyo encabezado reconoce más campos canónicos.
 */
export function parsearPacientes(buffer: ArrayBuffer | Uint8Array): ResultadoParseo {
  const wb = XLSX.read(buffer, { type: "array" });

  let elegido: ResultadoParseo | null = null;
  let mejorScore = -1;

  for (const nombreHoja of wb.SheetNames) {
    const ws = wb.Sheets[nombreHoja];
    if (!ws) continue;
    const matriz = hojaAMatriz(ws);
    if (matriz.length === 0) continue;

    const idxEnc = encontrarEncabezado(matriz);
    const headers = (matriz[idxEnc] ?? []).map((h) => h.trim());
    const score = puntuarComoEncabezado(headers);
    // Necesitamos al menos nombre + un identificador de hospital/doc para considerarla.
    if (score < 2) continue;

    if (score > mejorScore) {
      const filas: FilaCruda[] = [];
      for (let r = idxEnc + 1; r < matriz.length; r++) {
        const fila = matriz[r] ?? [];
        const obj: FilaCruda = {};
        let tieneValor = false;
        headers.forEach((h, i) => {
          const clave = h || `col_${i}`;
          const valor = fila[i] ?? null;
          obj[clave] = valor === "" ? null : valor;
          if (valor != null && String(valor).trim() !== "") tieneValor = true;
        });
        if (tieneValor) filas.push(obj);
      }
      elegido = { hoja: nombreHoja, headers, filas };
      mejorScore = score;
    }
  }

  return elegido ?? { hoja: "", headers: [], filas: [] };
}

/** Mapa: campo canónico -> nombre de columna detectado en las cabeceras. */
export type MapaColumnas = Partial<Record<keyof RegistroPaciente, string>>;

/** Construye el mapa de columnas a partir de las cabeceras detectadas. */
export function mapearColumnas(headers: string[]): MapaColumnas {
  const mapa: MapaColumnas = {};
  for (const campo of CAMPOS) {
    const col = headers.find((h) => PATRONES[campo].test(h));
    if (col) mapa[campo] = col;
  }
  return mapa;
}

/** Convierte una edad cruda a entero plausible (0–120) o null. */
function parsearEdad(valor: unknown): number | null {
  if (valor == null) return null;
  const n = parseInt(String(valor).replace(/[^0-9]/g, ""), 10);
  if (Number.isNaN(n) || n < 0 || n > 120) return null;
  return n;
}

const aStr = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

/** Mapea una fila cruda a un RegistroPaciente usando el mapa de columnas. */
export function mapearFila(fila: FilaCruda, mapa: MapaColumnas): RegistroPaciente {
  const val = (campo: keyof RegistroPaciente): unknown =>
    mapa[campo] ? fila[mapa[campo] as string] : null;
  return {
    hospitalNombre: aStr(val("hospitalNombre")),
    nombre: aStr(val("nombre")),
    edad: parsearEdad(val("edad")),
    docNumero: aStr(val("docNumero")),
    telefono: aStr(val("telefono")),
    direccion: aStr(val("direccion")),
    observaciones: aStr(val("observaciones")),
  };
}

/** ¿La edad indica que es menor de edad? (regla de privacidad: no por buscador abierto). */
export function esMenor(edad: number | null): boolean {
  return edad != null && edad < 18;
}

/**
 * Hash estable del contenido de una fila para idempotencia (-> staging_filas.content_hash).
 * Determinista (FNV-1a 32-bit), sin crypto, para mantener la lib pura y portable.
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
