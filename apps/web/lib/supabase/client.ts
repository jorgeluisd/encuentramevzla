"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para el BROWSER (rol anónimo).
 *
 * Usa la ANON KEY: por RLS no tiene acceso a las tablas de datos ni al schema
 * `sensitive`. Lo único que el público puede invocar es el RPC `search_patient`.
 * NUNCA poner aquí la service role key.
 */
export function createBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno.",
    );
  }

  return createClient(url, anonKey, {
    auth: { persistSession: true },
  });
}
