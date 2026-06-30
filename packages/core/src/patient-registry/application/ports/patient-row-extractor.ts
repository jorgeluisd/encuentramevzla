import type { ParsedPatientRow } from "./patient-list-parser";

// Port de extracción (transcript → filas canónicas). Produce el MISMO tipo que el parser
// de Excel, de modo que la fila dictada reusa todo el pipeline de ingesta (dedup/merge/audit).
// Lo implementa un adapter externo (Claude Haiku 4.5, salida estructurada). 1-a-1: la UI usa
// el primer/único registro.
export interface PatientRowExtractor {
  extract(transcript: string): Promise<ParsedPatientRow[]>;
}
