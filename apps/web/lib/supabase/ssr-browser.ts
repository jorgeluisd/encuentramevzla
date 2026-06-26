"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para el BROWSER con sesión por COOKIES (@supabase/ssr).
 * Se usa SOLO en la página de login para pedir el magic-link (signInWithOtp).
 * Anon key: sin acceso a tablas; el RPC público sigue por `anon.ts`.
 */
export function createSsrBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno.",
    );
  }
  return createBrowserClient(url, anonKey);
}
