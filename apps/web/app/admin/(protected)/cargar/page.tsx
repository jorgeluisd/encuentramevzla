import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth/current-member";
import { hospitalDirectory, hospitalPatientListReader } from "@/lib/composition";
import { CargarClient } from "./cargar-client";

// STT + extracción + ingesta: red de seguridad de tiempo (Vercel Pro). Render por request.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * `/admin/cargar` — vista unificada de captura (Dictar / Manual / Subir Excel) con lista en vivo
 * y descarga del Excel del hospital. Scoping server-side: el miembro acotado solo ve/edita lo suyo.
 */
export default async function CargarPage({
  searchParams,
}: {
  searchParams: Promise<{ hospitalId?: string; q?: string; page?: string }>;
}): Promise<React.ReactElement> {
  const current = await getCurrentMember();
  if (current.kind !== "authorized") redirect("/admin/login");
  const member = current.member;
  const isScoped = member.hospitalId !== null;

  const sp = await searchParams;
  // Acotado → su hospital, fijo (no manipulable). Global → el elegido por query (o ninguno aún).
  const activeHospitalId = isScoped ? member.hospitalId : (sp.hospitalId ?? null);
  const search = (sp.q ?? "").trim();
  const pageSize = 50;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  // En paralelo: directorio de hospitales y la página de la lista (queries independientes).
  const [hospitales, listResult] = await Promise.all([
    hospitalDirectory().listActive(),
    activeHospitalId
      ? hospitalPatientListReader().listForHospital({
          hospitalId: activeHospitalId,
          search,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        })
      : Promise.resolve({ items: [], total: 0 }),
  ]);
  const { items, total } = listResult;
  const activeHospitalName = hospitales.find((h) => h.id === activeHospitalId)?.name ?? null;

  return (
    <CargarClient
      isScoped={isScoped}
      hospitals={hospitales}
      activeHospitalId={activeHospitalId}
      activeHospitalName={activeHospitalName}
      items={items}
      total={total}
      page={page}
      pageSize={pageSize}
      search={search}
    />
  );
}
