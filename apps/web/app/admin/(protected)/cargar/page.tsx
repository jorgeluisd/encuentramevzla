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
  searchParams: Promise<{ hospitalId?: string }>;
}): Promise<React.ReactElement> {
  const current = await getCurrentMember();
  if (current.kind !== "authorized") redirect("/admin/login");
  const member = current.member;
  const isScoped = member.hospitalId !== null;

  const hospitales = await hospitalDirectory().listActive();
  const sp = await searchParams;
  // Acotado → su hospital, fijo (no manipulable). Global → el elegido por query (o ninguno aún).
  const activeHospitalId = isScoped ? member.hospitalId : (sp.hospitalId ?? null);
  const items = activeHospitalId
    ? await hospitalPatientListReader().listForHospital(activeHospitalId)
    : [];
  const activeHospitalName = hospitales.find((h) => h.id === activeHospitalId)?.name ?? null;

  return (
    <CargarClient
      isScoped={isScoped}
      hospitals={hospitales}
      activeHospitalId={activeHospitalId}
      activeHospitalName={activeHospitalName}
      items={items}
    />
  );
}
