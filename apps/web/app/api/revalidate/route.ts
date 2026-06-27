import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/revalidate — regenera el home estático (sello "Actualizado") bajo demanda.
 *
 * Protegido por secreto (`REVALIDATE_TOKEN`). Pensado para completar el ciclo cuando
 * una carga termina FUERA de la app (p. ej. un script one-off), ya que sin pasar por
 * `subirExcelAction` no se dispara `revalidatePath("/")` y el sello queda desfasado.
 *
 * No expone datos: solo dispara la regeneración.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const token = process.env.REVALIDATE_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const header = request.headers.get("authorization");
  const provided = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (provided !== token) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  revalidatePath("/");
  return NextResponse.json({ ok: true, revalidated: "/" });
}
