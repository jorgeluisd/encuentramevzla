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

// Caso de uso de dictado: audio → STT → extracción de campos. NO persiste nada (el humano
// confirma después). El audio se descarta tras transcribir (no se guarda blob). D7.
export class TranscribePatientDictation {
  constructor(private readonly deps: TranscribeDictationDependencies) {}

  async execute(input: { audio: Uint8Array; opts?: TranscribeOptions }): Promise<DictationResult> {
    const { text } = await this.deps.transcriber.transcribe(input.audio, input.opts);
    // Audio sin voz → transcript vacío: no llamamos al extractor (ahorra una llamada externa).
    if (text.trim() === "") return { transcript: text, rows: [] };
    const rows = await this.deps.extractor.extract(text);
    return { transcript: text, rows };
  }
}
