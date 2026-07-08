import { canModerate, type SolidarityServiceRecord } from "@evzla/core";
import { getCurrentMember } from "@/lib/auth/current-member";
import { listAllServicesUseCase } from "@/lib/composition";
import {
  ServicesAdminBrowser,
  type AdminServiceView,
} from "@/components/servicios/services-admin-browser";
import { Card, CardBody } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
}

function toAdminView(s: SolidarityServiceRecord): AdminServiceView {
  return {
    id: s.id,
    title: s.title,
    category: s.category,
    description: s.description,
    contactPhone: s.contactPhone,
    submitterEmail: s.submitterEmail,
    status: s.status,
    reported: s.reported,
    reportReason: s.reportReason,
    createdAt: formatDate(s.createdAt),
    expiresAt: formatDate(s.expiresAt),
  };
}

// Orden de la cola: reportadas primero, luego pendientes de aprobar, luego el resto.
// Dentro de cada grupo se conserva el orden de la consulta (más recientes primero).
function reviewRank(s: SolidarityServiceRecord): number {
  if (s.reported) return 0;
  if (s.status === "pending") return 1;
  return 2;
}

export default async function AdminServiciosPage(): Promise<React.ReactElement> {
  const current = await getCurrentMember();
  if (current.kind !== "authorized" || !canModerate(current.member.role)) {
    return (
      <Card className="border-danger/30 bg-danger/5">
        <CardBody className="py-8 text-center text-sm text-text-2">
          Solo un moderador puede revisar los servicios solidarios.
        </CardBody>
      </Card>
    );
  }

  const { items } = await listAllServicesUseCase().execute({ pageSize: 200 });
  const ordered = [...items].sort((a, b) => reviewRank(a) - reviewRank(b));

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Servicios solidarios</h1>
        <p className="text-sm text-text-2">
          Reportadas primero, luego pendientes de aprobar y después el resto. Busca o filtra por
          estado. Si el autor pierde su enlace de gestión, puedes reenviárselo (se genera uno nuevo
          y el anterior deja de funcionar). Vigencia: 3 meses.
        </p>
      </div>
      <ServicesAdminBrowser items={ordered.map(toAdminView)} />
    </div>
  );
}
