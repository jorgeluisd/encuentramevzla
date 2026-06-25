// ============================================================================
// supabase/functions/dedup — Edge Function (Deno) — STUB de fase 2.
//
// Aquí vivirá el WORKER PESADO de deduplicación / OCR cuando llegue la fase 2.
// Todo el backend del proyecto es Supabase (no hay NestJS ni servidor propio):
// este worker corre como Supabase Edge Function en Deno, NO con BullMQ/Redis.
//
// Flujo previsto (fase 2, aún NO implementado):
//   1. Disparado por webhook / cron de Supabase tras una ingesta.
//   2. Lee lotes de `public.staging_filas` con el service role.
//   3. (OCR) Si la fila provino de imagen/PDF, extrae texto.
//   4. Normaliza nombres/documentos (lógica equivalente a @registro/ingesta).
//   5. Dedup (pg_trgm + fuzzystrmatch/levenshtein) contra `public.personas`.
//   6. Upsert de `personas` e `ingresos` (resolviendo traslados) + audit_log.
//
// NOTA: este archivo es un placeholder Deno; el monorepo Node/TS no lo compila.
// Se despliega con `supabase functions deploy dedup`.
// ============================================================================

// @ts-nocheck — entorno Deno (Edge Runtime), fuera del tsconfig del monorepo.
Deno.serve((_req: Request): Response => {
  // TODO(fase 2): implementar el worker de dedup/OCR descrito arriba.
  return new Response(
    JSON.stringify({ ok: true, stub: true, mensaje: "dedup worker — pendiente (fase 2)" }),
    { headers: { "content-type": "application/json" }, status: 501 },
  );
});
