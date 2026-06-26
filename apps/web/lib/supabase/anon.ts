import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase con la ANON KEY, usable tanto en servidor como en cliente
 * (sin la directiva "use client"). La anon key es pública por diseño.
 *
 * Por RLS, este cliente NO puede leer ninguna tabla de datos ni el schema `sensible`:
 * lo único que puede hacer es ejecutar el RPC mediado `buscar_paciente`.
 */
export function createAnonClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno.",
    );
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
