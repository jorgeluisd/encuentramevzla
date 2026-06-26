import * as XLSX from "xlsx";

// Parseo de Excel (SheetJS): detecta la mejor hoja, la fila de encabezado y mapea
// columnas por patrón. Preserva la fila cruda. Detalle de infraestructura.

export type RawRow = Record<string, unknown>;

export interface MappedPatient {
  hospitalName: string | null;
  fullName: string | null;
  age: number | null;
  documentNumber: string | null;
  phone: string | null;
  address: string | null;
  clinicalNotes: string | null;
}

export interface ParsedSheet {
  sheet: string;
  headers: string[];
  rows: RawRow[];
}

// Patrones de cabecera con límites de palabra (evita que "id" matchee "apellidos").
const PATTERNS: Record<keyof MappedPatient, RegExp> = {
  hospitalName: /\bhospital\b|\bcentro\b|\bclinica\b|\bcl[ií]nica\b/i,
  fullName: /apellid|nombre|paciente/i,
  age: /\bedad\b|\ba[nñ]os\b/i,
  documentNumber: /\bc[eé]dula\b|\bdocumento\b|\bc\.?i\.?\b|\bid\b|\bdni\b/i,
  phone: /\btel[eé]fono\b|\btel[eé]f\b|\btel\b|\bcelular\b|\bm[oó]vil\b/i,
  address: /\bdirecci[oó]n\b|\bdomicilio\b|\bdirec\b/i,
  clinicalNotes: /observ|diagn[oó]st|\bnotas?\b/i,
};

const FIELDS = Object.keys(PATTERNS) as (keyof MappedPatient)[];

function scoreAsHeader(cells: string[]): number {
  return FIELDS.reduce(
    (acc, field) => (cells.some((c) => PATTERNS[field].test(c)) ? acc + 1 : acc),
    0,
  );
}

function sheetToMatrix(ws: XLSX.WorkSheet): string[][] {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    blankrows: false,
  });
  return matrix.map((row) => (row ?? []).map((c) => (c == null ? "" : String(c))));
}

function findHeaderRow(matrix: string[][]): number {
  let bestIndex = 0;
  let best = -1;
  const limit = Math.min(matrix.length, 15);
  for (let r = 0; r < limit; r++) {
    const score = scoreAsHeader(matrix[r] ?? []);
    if (score > best) {
      best = score;
      bestIndex = r;
    }
  }
  return bestIndex;
}

// Elige la hoja cuyo encabezado reconoce más campos canónicos.
export function parsePatientSheet(bytes: ArrayBuffer | Uint8Array): ParsedSheet {
  const wb = XLSX.read(bytes, { type: "array" });

  let chosen: ParsedSheet | null = null;
  let bestScore = -1;

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const matrix = sheetToMatrix(ws);
    if (matrix.length === 0) continue;

    const headerIndex = findHeaderRow(matrix);
    const headers = (matrix[headerIndex] ?? []).map((h) => h.trim());
    const score = scoreAsHeader(headers);
    if (score < 2) continue;

    if (score > bestScore) {
      const rows: RawRow[] = [];
      for (let r = headerIndex + 1; r < matrix.length; r++) {
        const row = matrix[r] ?? [];
        const obj: RawRow = {};
        let hasValue = false;
        headers.forEach((h, i) => {
          const key = h || `col_${i}`;
          const value = row[i] ?? null;
          obj[key] = value === "" ? null : value;
          if (value != null && String(value).trim() !== "") hasValue = true;
        });
        if (hasValue) rows.push(obj);
      }
      chosen = { sheet: name, headers, rows };
      bestScore = score;
    }
  }

  return chosen ?? { sheet: "", headers: [], rows: [] };
}

export type ColumnMap = Partial<Record<keyof MappedPatient, string>>;

export function mapColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  for (const field of FIELDS) {
    const column = headers.find((h) => PATTERNS[field].test(h));
    if (column) map[field] = column;
  }
  return map;
}

function parseAge(value: unknown): number | null {
  if (value == null) return null;
  const n = parseInt(String(value).replace(/[^0-9]/g, ""), 10);
  if (Number.isNaN(n) || n < 0 || n > 120) return null;
  return n;
}

function toStr(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

export function mapRow(row: RawRow, map: ColumnMap): MappedPatient {
  const get = (field: keyof MappedPatient): unknown =>
    map[field] ? row[map[field] as string] : null;
  return {
    hospitalName: toStr(get("hospitalName")),
    fullName: toStr(get("fullName")),
    age: parseAge(get("age")),
    documentNumber: toStr(get("documentNumber")),
    phone: toStr(get("phone")),
    address: toStr(get("address")),
    clinicalNotes: toStr(get("clinicalNotes")),
  };
}

// Hash estable de la fila cruda para idempotencia (FNV-1a 32-bit, sin crypto).
export function rowFingerprint(row: RawRow): string {
  const json = JSON.stringify(row, Object.keys(row).sort());
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
