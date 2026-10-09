import { NextResponse, type NextRequest } from "next/server";
import { cognitoEmailOtp, verifyIdToken } from "@/lib/auth/cognito";
import {
  ID_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE,
  resolveSession,
  sessionCookieOptions,
} from "@/lib/infrastructure/auth/session";
import { isOriginVerified, ORIGIN_VERIFY_HEADER } from "@/lib/infrastructure/origin-verify";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (!isOriginVerified(request.headers.get(ORIGIN_VERIFY_HEADER), process.env.ORIGIN_VERIFY_SECRET)) {
    return new NextResponse(null, { status: 403 });
  }
  if (!request.nextUrl.pathname.startsWith("/admin")) return NextResponse.next();
  return refreshAdminSession(request);
}

// Refresca el id token con el refresh token antes de que lo lean los Server Components (que no
// pueden escribir cookies). NO autoriza: eso lo decide el guard de /admin con la allow-list.
async function refreshAdminSession(request: NextRequest): Promise<NextResponse> {
  const session = await resolveSession(
    {
      idToken: request.cookies.get(ID_TOKEN_COOKIE)?.value ?? null,
      refreshToken: request.cookies.get(REFRESH_TOKEN_COOKIE)?.value ?? null,
    },
    { verify: verifyIdToken, refresh: (rt) => cognitoEmailOtp().refresh(rt) },
  ).catch(() => ({ email: null }) as const);

  if (session.email && session.store) {
    request.cookies.set(ID_TOKEN_COOKIE, session.store.idToken);
    const response = NextResponse.next({ request });
    response.cookies.set(ID_TOKEN_COOKIE, session.store.idToken, sessionCookieOptions(session.store.expiresIn));
    response.cookies.set(
      REFRESH_TOKEN_COOKIE,
      session.store.refreshToken,
      sessionCookieOptions(REFRESH_TOKEN_MAX_AGE),
    );
    return response;
  }

  if (session.email === null && "clear" in session && session.clear) {
    request.cookies.delete(ID_TOKEN_COOKIE);
    request.cookies.delete(REFRESH_TOKEN_COOKIE);
    const response = NextResponse.next({ request });
    response.cookies.delete(ID_TOKEN_COOKIE);
    response.cookies.delete(REFRESH_TOKEN_COOKIE);
    return response;
  }

  return NextResponse.next({ request });
}
