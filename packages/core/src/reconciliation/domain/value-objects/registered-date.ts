// Value object: FECHA REG. cruda + parseo best-effort a una fecha ISO (o null).
// El crudo SIEMPRE se conserva; el parseo nunca inventa datos (sin año ⇒ null).
//
// Casos reales del consolidado: datetime (el adapter lo entrega ya en ISO),
// texto tipo fecha "25/06/2026", rangos "25/06-26/06" (se toma la primera fecha si
// trae año), vacíos, y basura de encabezado infiltrada ("Fecha Actualización").

const ISO = /(\d{4})-(\d{2})-(\d{2})/;
// dd/mm/yyyy | dd-mm-yyyy | dd.mm.yy … (año opcional). El separador del año debe ser el
// MISMO que el del día (backreference \2): así "25/06-26/06" es un rango sin año (el "-26"
// no se confunde con el año), pero "25-06-2026" sí trae año.
const DMY = /(\d{1,2})([/.-])(\d{1,2})(?:\2(\d{2,4}))?/;

export class RegisteredDate {
  private constructor(
    readonly raw: string,
    readonly iso: string | null,
  ) {}

  static fromRaw(raw: string): RegisteredDate {
    const original = raw ?? "";
    const text = original.trim();
    if (text === "") return new RegisteredDate(original, null);
    // Basura de encabezado que se infiltró como fila de datos.
    if (/fecha\s+actualiz/i.test(text)) return new RegisteredDate(original, null);

    const isoMatch = ISO.exec(text);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      return new RegisteredDate(original, buildIso(Number(y), Number(m), Number(d)));
    }

    const dmy = DMY.exec(text);
    if (dmy) {
      const [, dd, , mm, yy] = dmy;
      // Sin año (típico de los rangos "25/06-26/06") no se inventa: best-effort ⇒ null.
      if (yy === undefined) return new RegisteredDate(original, null);
      const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
      return new RegisteredDate(original, buildIso(year, Number(mm), Number(dd)));
    }

    return new RegisteredDate(original, null);
  }
}

// Devuelve 'YYYY-MM-DD' si es una fecha de calendario válida; si no, null.
function buildIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 2000 || year > 2100) return null;
  const iso = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
  // Rechaza días imposibles (31/02) reconstruyendo la fecha en UTC.
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) return null;
  return iso;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}
