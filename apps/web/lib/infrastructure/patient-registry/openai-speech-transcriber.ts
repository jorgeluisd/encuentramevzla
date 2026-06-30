import OpenAI, { toFile } from "openai";
import type { SpeechTranscriber, TranscribeOptions } from "@evzla/core";

// Adapter STT con OpenAI gpt-4o-transcribe (D2). Español es Tier-1. El audio NO se persiste:
// llega como bytes, se transcribe y se descarta (D7). SDK externo SOLO aquí (core puro).
export class OpenAiSpeechTranscriber implements SpeechTranscriber {
  private readonly client: OpenAI;
  constructor(apiKey: string, private readonly model = "gpt-4o-transcribe") {
    this.client = new OpenAI({ apiKey });
  }

  async transcribe(audio: Uint8Array, opts?: TranscribeOptions): Promise<{ text: string }> {
    const file = await toFile(audio, "dictado.webm", {
      type: opts?.mimeType ?? "audio/webm",
    });
    const result = await this.client.audio.transcriptions.create({
      file,
      model: this.model,
      language: opts?.language ?? "es",
    });
    return { text: result.text ?? "" };
  }
}
