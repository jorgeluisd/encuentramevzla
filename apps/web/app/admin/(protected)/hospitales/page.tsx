import { redirect } from "next/navigation";
import { canModerate } from "@evzla/core";
import { getCurrentMember } from "@/lib/auth/current-member";
import { listHospitalsUseCase } from "@/lib/composition";
import { Card, CardBody } from "@/components/ui/card";
import { HospitalesClient } from "./hospitales-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * `/admin/hospitales` — gestión de hospitales (crear/editar/activar/test). Solo moderador global.
 * Marcar test/inactivo solo RESTRINGE el buscador público (spec 0015); no expone datos sensibles.
 */
export default async function HospitalesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<React.ReactElement> {
  const current = await getCurrentMember();
  if (current.kind !== "authorized") redirect("/admin/login");

  if (!canModerate(current.member.role)) {
    return (
      <Card className="border-danger/30 bg-danger/5">
        <CardBody>
          <p className="text-sm text-danger">Solo un moderador puede gestionar hospitales.</p>
        </CardBody>
      </Card>
    );
  }

  const sp = await searchParams;
  const q = sp.q?.trim() || null;
  const hospitales = await listHospitalsUseCase().execute({
    actor: { role: current.member.role },
    q,
  });

  return <HospitalesClient hospitals={hospitales} query={q ?? ""} />;
}
