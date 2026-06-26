import "server-only";

import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para el SERVIDOR con sesión por COOKIES (@supabase/ssr).
 * Usa la ANON KEY: la sesión identifica al usuario (email) para el guard de /admin,
 * pero por RLS no puede leer tablas de datos ni el schema `sensitive`.
 */
export async function createSsrServerClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno.",
    );
  }

  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // En Server Components no se pueden escribir cookies: lo ignora y deja que
        // el middleware refresque la sesión. En route handlers sí escribe.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options as CookieOptions);
          }
        } catch {
          /* noop: contexto RSC de solo lectura */
        }
      },
    },
  });
}

/** Email de la sesión validado contra el servidor de auth, o null si no hay sesión. */
export async function getSessionEmail(): Promise<string | null> {
  const supabase = await createSsrServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? null;
}
