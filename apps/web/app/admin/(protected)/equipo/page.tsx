import { redirect } from "next/navigation";
import { canManageHospitalTeam } from "@evzla/core";
import { getCurrentMember } from "@/lib/auth/current-member";
import { hospitalDirectory, listTeamMembersUseCase } from "@/lib/composition";
import { Card, CardBody } from "@/components/ui/card";
import { EquipoClient } from "./equipo-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PAGE_SIZE = 20;

/**
 * `/admin/equipo` — gestión del personal (D13). El moderador global gestiona todo el personal;
 * el hospital_admin gestiona SOLO el de su hospital. Scoping, búsqueda y paginación server-side.
 */
export default async function EquipoPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}): Promise<React.ReactElement> {
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

  const sp = await searchParams;
  const q = sp.q?.trim() || null;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const { members, total } = await listTeamMembersUseCase().execute({
    scopeHospitalId,
    q,
    page,
    pageSize: PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > totalPages) {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (totalPages > 1) qs.set("page", String(totalPages));
    redirect(qs.toString() ? `/admin/equipo?${qs.toString()}` : "/admin/equipo");
  }

  const hospitalName = isGlobal
    ? null
    : (hospitales.find((h) => h.id === member.hospitalId)?.name ?? null);

  return (
    <EquipoClient
      isGlobal={isGlobal}
      hospitals={hospitales}
      members={members}
      hospitalName={hospitalName}
      total={total}
      page={page}
      totalPages={totalPages}
      query={q ?? ""}
    />
  );
}
