import type { ParsedPatientList, ParsedPatientRow, PatientListParser } from "@evzla/core";
import { mapColumns, mapRow, parsePatientSheet, rowFingerprint } from "./excel-parsing";

// Adapter SheetJS: produce ParsedPatientRow[] preservando la fila cruda.
export class SheetjsPatientListParser implements PatientListParser {
  parse(bytes: Uint8Array): ParsedPatientList {
    const { sheet, headers, rows } = parsePatientSheet(bytes);
    const columns = mapColumns(headers);
    const parsed: ParsedPatientRow[] = rows.map((raw) => ({
      fingerprint: rowFingerprint(raw),
      raw,
      ...mapRow(raw, columns),
    }));
    return { sheet, rows: parsed };
  }
}
