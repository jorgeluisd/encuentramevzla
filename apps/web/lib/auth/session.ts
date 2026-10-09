import "server-only";

import { cookies } from "next/headers";
import { ID_TOKEN_COOKIE } from "@/lib/infrastructure/auth/session";
import { verifyIdToken } from "@/lib/auth/cognito";

// Email de la sesión con el id token verificado, o null. El refresco lo hace proxy.ts antes.
export async function getSessionEmail(): Promise<string | null> {
  const idToken = (await cookies()).get(ID_TOKEN_COOKIE)?.value;
  return idToken ? verifyIdToken(idToken) : null;
}
