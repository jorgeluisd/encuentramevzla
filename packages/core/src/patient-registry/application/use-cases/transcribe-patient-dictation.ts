import type { ParsedPatientRow } from "../ports/patient-list-parser";
import type { PatientRowExtractor } from "../ports/patient-row-extractor";
import type { SpeechTranscriber, TranscribeOptions } from "../ports/speech-transcriber";

export interface TranscribeDictationDependencies {
  transcriber: SpeechTranscriber;
  extractor: PatientRowExtractor;
}

export interface DictationResult {
  transcript: string;
  rows: ParsedPatientRow[];
}

// Contexto genérico para el STT: sesga la ortografía hacia nombres venezolanos y jerga de
// hospital. NO contiene datos reales de pacientes (solo apellidos comunes de ejemplo). D7.
export const DICTATION_STT_PROMPT =
  "Transcripción de un dictado para registrar a una persona ingresada en un hospital de " +
  "Venezuela. Español venezolano. Pueden aparecer nombres y apellidos venezolanos (por ejemplo " +
  "Sifontes, Chirinos, Bracamonte), número de cédula, edad, teléfono y el nombre del hospital.";

// Caso de uso de dictado: audio → STT → extracción de campos. NO persiste nada (el humano
// confirma después). El audio se descarta tras transcribir (no se guarda blob). D7.
export class TranscribePatientDictation {
  constructor(private readonly deps: TranscribeDictationDependencies) {}

  async execute(input: { audio: Uint8Array; opts?: TranscribeOptions }): Promise<DictationResult> {
    // Inyecta el prompt de contexto por defecto (mejora nombres propios) sin pisar el explícito.
    const opts: TranscribeOptions = {
      ...input.opts,
      prompt: input.opts?.prompt ?? DICTATION_STT_PROMPT,
    };
    const { text } = await this.deps.transcriber.transcribe(input.audio, opts);
    // Audio sin voz → transcript vacío: no llamamos al extractor (ahorra una llamada externa).
    if (text.trim() === "") return { transcript: text, rows: [] };
    const rows = await this.deps.extractor.extract(text);
    return { transcript: text, rows };
  }
}
