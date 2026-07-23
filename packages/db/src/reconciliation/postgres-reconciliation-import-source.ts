import type { ParsedPatientRow, ReconciliationImportSource } from "@evzla/core";
import type postgres from "postgres";
import { LOAD_IMPORTABLE_SQL } from "./reconciliation-sql";

// Adapter: lee las filas importables del esquema `reconciliation` y las mapea a ParsedPatientRow.
// Aquí vive el mapeo de columnas del Excel (incluido el sensible de Refugio Oeste, ADR-0009):
// nada sensible va a `public`; teléfono/dirección/patologías se entregan para el schema `sensitive`.
export class PostgresReconciliationImportSource implements ReconciliationImportSource {
  constructor(private readonly sql: postgres.Sql) {}

  async loadImportable(runId: string): Promise<ParsedPatientRow[]> {
    const rows = await this.sql.unsafe(LOAD_IMPORTABLE_SQL, [runId]);
    return rows.map((row) => {
      const raw = (row["raw"] ?? {}) as Record<string, unknown>;
      const sheetName = row["sheet_name"] as string;
      const get = (key: string): string => {
        const v = raw[key];
        return v == null ? "" : String(v).trim();
      };

      const fullName = `${get("APELLIDO")} ${get("NOMBRE")}`.trim() || null;
      // Teléfono → sensitive.contacts.phone (Refugio Oeste). Nunca a `public`.
      const phone = firstNonEmpty(get("TELÉFONO"), get("TELÉFONO DE EMERGENCIA"));
      // Dirección compuesta → sensitive.contacts.address.
      const address = firstNonEmpty(
        compose([get("SECTOR"), get("PARROQUIA"), get("MUNICIPIO"), get("ESTADO"), get("COMUNA")]),
        get("PROCEDENCIA"),
      );
      // Contexto clínico/humanitario → sensitive.clinical_notes.note.
      const clinicalNotes = firstNonEmpty(
        compose([
          get("OBSERVACIONES"),
          get("PATOLOGÍAS"),
          get("MOTIVO DE REFUGIO"),
          get("NECESIDADES BÁSICAS"),
          get("OBSERVACIONES ADICIONALES"),
          get("GRUPO FAMILIAR"),
          get("PERTENENCIAS"),
        ]),
      );

      return {
        // Fingerprint estable por contenido (idempotencia de raw_rows).
        fingerprint: fnv1a(JSON.stringify(raw, Object.keys(raw).sort())),
        raw,
        hospitalName: sheetName, // la PESTAÑA es el centro autoritativo (ADR-0008)
        fullName,
        age: parseAge(get("EDAD")),
        documentNumber: firstNonEmpty(get("CÉDULA")), // DocumentId.fromRaw descarta centinelas
        phone,
        address,
        clinicalNotes,
        isMinor: row["is_minor"] === true, // propaga el menor capturado por centinela (ADR-0009)
      } satisfies ParsedPatientRow;
    });
  }
}

function compose(parts: string[]): string {
  return parts.filter((p) => p !== "").join(" — ");
}

function firstNonEmpty(...values: string[]): string | null {
  for (const v of values) if (v && v.trim() !== "") return v;
  return null;
}

function parseAge(value: string): number | null {
  const digits = value.replace(/[^0-9]/g, "");
  if (digits === "") return null;
  const n = Number.parseInt(digits, 10);
  return Number.isNaN(n) || n < 0 || n > 120 ? null : n;
}

// FNV-1a 32-bit (mismo algoritmo que el parser de ingesta, para idempotencia por contenido).
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
