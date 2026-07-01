// Opciones de transcripción (idioma, tipo MIME del audio). Pistas para el STT.
export interface TranscribeOptions {
  language?: string; // p.ej. "es"
  mimeType?: string; // p.ej. "audio/webm"
  prompt?: string; // contexto/vocabulario para sesgar la ortografía (nombres propios)
}

// Port de STT (audio → texto). Lo implementa un adapter externo (OpenAI/Deepgram);
// el audio NO se persiste (D7). El dominio queda agnóstico del proveedor.
export interface SpeechTranscriber {
  transcribe(audio: Uint8Array, opts?: TranscribeOptions): Promise<{ text: string }>;
}
