import type { ParsedPatientList, ParsedPatientRow, PatientListParser } from "@evzla/core";
import { contentHash, mapearColumnas, mapearFila, parsearPacientes } from "@registro/ingesta";

// Adapter SheetJS: envuelve el parser existente y produce ParsedPatientRow[].
export class SheetjsPatientListParser implements PatientListParser {
  parse(bytes: Uint8Array): ParsedPatientList {
    const { hoja, headers, filas } = parsearPacientes(bytes);
    const columns = mapearColumnas(headers);
    const rows: ParsedPatientRow[] = filas.map((fila) => {
      const mapped = mapearFila(fila, columns);
      return {
        fingerprint: contentHash(fila),
        raw: fila,
        hospitalName: mapped.hospitalNombre,
        fullName: mapped.nombre,
        age: mapped.edad,
        documentNumber: mapped.docNumero,
        phone: mapped.telefono,
        address: mapped.direccion,
        clinicalNotes: mapped.observaciones,
      };
    });
    return { sheet: hoja, rows };
  }
}
