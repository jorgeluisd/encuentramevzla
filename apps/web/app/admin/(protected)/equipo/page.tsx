import { redirect } from "next/navigation";
import { canManageHospitalTeam } from "@evzla/core";
import { getCurrentMember } from "@/lib/auth/current-member";
import { hospitalDirectory, teamMemberAdmin } from "@/lib/composition";
import { Card, CardBody } from "@/components/ui/card";
import { EquipoClient } from "./equipo-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * `/admin/equipo` — alta de hospitales y personal (D13). El moderador global gestiona hospitales
 * y todo el personal; el hospital_admin gestiona SOLO el personal de su hospital. Scoping server-side.
 */
export default async function EquipoPage(): Promise<React.ReactElement> {
  const current = await getCurrentMember();
  if (current.kind !== "authorized") redirect("/admin/login");
  const member = current.member;

  if (!canManageHospitalTeam(member.role)) {
    return (
      <Card className="border-danger/30 bg-danger/5">
        <CardBody>
          <p className="text-sm text-danger">No tienes permiso para gestionar el equipo.</p>
        </CardBody>
      </Card>
    );
  }

  const isGlobal = member.role === "moderator";
  const hospitales = await hospitalDirectory().listActive();
  const scopeHospitalId = isGlobal ? null : member.hospitalId;
  const miembros = await teamMemberAdmin().list(scopeHospitalId);
  const hospitalName = isGlobal
    ? null
    : (hospitales.find((h) => h.id === member.hospitalId)?.name ?? null);

  return (
    <EquipoClient
      isGlobal={isGlobal}
      hospitals={hospitales}
      members={miembros}
      hospitalName={hospitalName}
    />
  );
}
