import { NextResponse, type NextRequest } from "next/server";
import { createSsrServerClient } from "@/lib/supabase/ssr-server";

/**
 * `/auth/callback` — el magic-link aterriza aquí con `?code=...`. Lo intercambia por
 * una sesión (cookies) y redirige al portal. Si falla, vuelve al login con error.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createSsrServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/admin/ingesta`);
    }
  }

  return NextResponse.redirect(`${origin}/admin/login?error=auth`);
}
