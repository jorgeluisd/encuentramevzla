import type { ParsedPatientRow } from "../ports/patient-list-parser";
import type { PatientRowExtractor } from "../ports/patient-row-extractor";
import type { SpeechTranscriber, TranscribeOptions } from "../ports/speech-transcriber";
import { DICTATION_STT_PROMPT, TranscribePatientDictation } from "./transcribe-patient-dictation";

class FakeTranscriber implements SpeechTranscriber {
  receivedBytes: Uint8Array | null = null;
  receivedOpts: TranscribeOptions | undefined;
  constructor(private readonly text: string) {}
  async transcribe(audio: Uint8Array, opts?: TranscribeOptions): Promise<{ text: string }> {
    this.receivedBytes = audio;
    this.receivedOpts = opts;
    return { text: this.text };
  }
}

class FakeExtractor implements PatientRowExtractor {
  receivedTranscript: string | null = null;
  constructor(private readonly rows: ParsedPatientRow[]) {}
  async extract(transcript: string): Promise<ParsedPatientRow[]> {
    this.receivedTranscript = transcript;
    return this.rows;
  }
}

const aRow = (over: Partial<ParsedPatientRow>): ParsedPatientRow => ({
  fingerprint: "f",
  raw: {},
  hospitalName: null,
  fullName: null,
  age: null,
  documentNumber: null,
  phone: null,
  address: null,
  clinicalNotes: null,
  ...over,
});

describe("TranscribePatientDictation", () => {
  it("transcribe el audio y extrae la(s) fila(s), devolviendo transcript + rows", async () => {
    const transcriber = new FakeTranscriber("Rosa Mora, cédula 12345678, 60 años");
    const extractor = new FakeExtractor([aRow({ fullName: "Rosa Mora", documentNumber: "12345678", age: 60 })]);
    const audio = new Uint8Array([1, 2, 3]);

    const result = await new TranscribePatientDictation({ transcriber, extractor }).execute({
      audio,
      opts: { language: "es" },
    });

    // El audio y las opciones llegan al transcriptor; el transcript al extractor.
    // El use case inyecta el prompt de contexto por defecto (mejora nombres propios).
    expect(transcriber.receivedBytes).toBe(audio);
    expect(transcriber.receivedOpts).toEqual({ language: "es", prompt: DICTATION_STT_PROMPT });
    expect(extractor.receivedTranscript).toBe("Rosa Mora, cédula 12345678, 60 años");

    expect(result.transcript).toBe("Rosa Mora, cédula 12345678, 60 años");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.fullName).toBe("Rosa Mora");
  });

  it("no extrae si el transcript queda vacío (audio sin voz)", async () => {
    const transcriber = new FakeTranscriber("   ");
    const extractor = new FakeExtractor([aRow({ fullName: "no debería usarse" })]);

    const result = await new TranscribePatientDictation({ transcriber, extractor }).execute({
      audio: new Uint8Array([0]),
    });

    expect(result.transcript).toBe("   ");
    expect(result.rows).toEqual([]);
    expect(extractor.receivedTranscript).toBeNull(); // no se llamó al extractor
  });

  it("inyecta el prompt de contexto por defecto cuando el llamador no lo pasa", async () => {
    const transcriber = new FakeTranscriber("Ana");
    const extractor = new FakeExtractor([]);

    await new TranscribePatientDictation({ transcriber, extractor }).execute({
      audio: new Uint8Array([1]),
      opts: { mimeType: "audio/webm" },
    });

    expect(transcriber.receivedOpts).toEqual({ mimeType: "audio/webm", prompt: DICTATION_STT_PROMPT });
  });

  it("respeta el prompt del llamador si viene explícito (no lo pisa)", async () => {
    const transcriber = new FakeTranscriber("Ana");
    const extractor = new FakeExtractor([]);

    await new TranscribePatientDictation({ transcriber, extractor }).execute({
      audio: new Uint8Array([1]),
      opts: { prompt: "contexto propio" },
    });

    expect(transcriber.receivedOpts).toEqual({ prompt: "contexto propio" });
  });
});
