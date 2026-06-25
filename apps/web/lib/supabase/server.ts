import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para el SERVIDOR (service role).
 *
 * ⚠️ La SERVICE ROLE KEY salta la RLS: SOLO debe usarse en código de servidor
 * (Server Actions, route handlers, el worker). El import de "server-only" hace
 * fallar el build si por error se importa desde un componente de cliente.
 *
 * Aun con service role, las operaciones de cara al público deben canalizarse por
 * el RPC mediado; este cliente es para ingesta/admin y tareas de backend.
 */
export function createServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor.",
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
