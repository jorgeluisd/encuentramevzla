export interface RevalidateDeps {
  token: string;
  revalidate: () => void;
}

export async function handleRevalidate(request: Request, deps: RevalidateDeps): Promise<Response> {
  if (!deps.token) {
    return Response.json({ ok: false, code: "not_configured" }, { status: 503 });
  }
  if (request.headers.get("x-revalidate-token") !== deps.token) {
    return Response.json({ ok: false, code: "unauthorized" }, { status: 401 });
  }
  deps.revalidate();
  return Response.json({ ok: true, revalidated: "/" });
}
