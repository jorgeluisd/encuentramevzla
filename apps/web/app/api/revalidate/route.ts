import { revalidatePath } from "next/cache";
import { appSecret } from "@/lib/infrastructure/app-secrets";
import { handleRevalidate } from "@/lib/revalidation/revalidate-request";

export const runtime = "nodejs";

// Regenera el home (sello "Actualizado") cuando una carga termina fuera de la app.
// El token va en x-revalidate-token: con OAC, CloudFront reescribe Authorization (ADR-0012).
export async function POST(request: Request): Promise<Response> {
  return handleRevalidate(request, {
    token: await appSecret("REVALIDATE_TOKEN"),
    revalidate: () => revalidatePath("/"),
  });
}
