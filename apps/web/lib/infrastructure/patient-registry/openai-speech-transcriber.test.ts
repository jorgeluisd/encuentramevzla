import { afterEach, describe, expect, it, vi } from "vitest";

// Mock del SDK de OpenAI: capturamos los argumentos de transcriptions.create.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock("openai", () => {
  class FakeOpenAI {
    audio = { transcriptions: { create: createMock } };
    constructor(_opts: unknown) {}
  }
  return {
    default: FakeOpenAI,
    toFile: vi.fn(async (bytes: unknown, name: string, opts: unknown) => ({ bytes, name, opts })),
  };
});

import { OpenAiSpeechTranscriber } from "./openai-speech-transcriber";

afterEach(() => {
  vi.clearAllMocks();
});

describe("OpenAiSpeechTranscriber", () => {
  it("reenvía el prompt de contexto y el idioma a transcriptions.create", async () => {
    createMock.mockResolvedValue({ text: "Rosa Mora" });

    const result = await new OpenAiSpeechTranscriber("key").transcribe(new Uint8Array([1, 2]), {
      language: "es",
      prompt: "contexto venezolano",
      mimeType: "audio/webm",
    });

    expect(result.text).toBe("Rosa Mora");
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-transcribe",
        language: "es",
        prompt: "contexto venezolano",
      }),
    );
  });

  it("cae a idioma 'es' por defecto y devuelve texto vacío si el SDK no da texto", async () => {
    createMock.mockResolvedValue({ text: undefined });

    const result = await new OpenAiSpeechTranscriber("key").transcribe(new Uint8Array([1]));

    expect(result.text).toBe("");
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ language: "es" }));
  });
});
