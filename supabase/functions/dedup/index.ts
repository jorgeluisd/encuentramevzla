// ============================================================================
// supabase/functions/dedup — STUB heredado de fase 2. NO está desplegado.
//
// Se escribió como Supabase Edge Function (Deno) cuando el proyecto vivía en Supabase.
// Desde el 9 de octubre de 2026 todo corre en AWS: si el worker de dedup/OCR llega a
// construirse, correrá en AWS (p. ej. Lambda con el rol de base que corresponda), no aquí.
//
// Flujo previsto (fase 2, aún NO implementado):
//   1. Disparado tras una ingesta.
//   2. Lee lotes de `public.raw_rows` server-side.
//   3. (OCR) Si la fila provino de imagen/PDF, extrae texto.
//   4. Normaliza nombres/documentos (lógica equivalente a @evzla/core).
//   5. Dedup (pg_trgm + fuzzystrmatch/levenshtein) contra `public.patients`.
//   6. Upsert de `patients` y `admissions` (resolviendo traslados) + audit_log.
//
// NOTA: placeholder Deno; el monorepo Node/TS no lo compila.
// ============================================================================

// @ts-nocheck — entorno Deno (Edge Runtime), fuera del tsconfig del monorepo.
Deno.serve((_req: Request): Response => {
  // TODO(fase 2): implementar el worker de dedup/OCR descrito arriba.
  return new Response(
    JSON.stringify({ ok: true, stub: true, mensaje: "dedup worker — pendiente (fase 2)" }),
    { headers: { "content-type": "application/json" }, status: 501 },
  );
});
