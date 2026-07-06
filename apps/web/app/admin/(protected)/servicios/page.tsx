import { canModerate } from "@evzla/core";
import { getCurrentMember } from "@/lib/auth/current-member";
import { listPendingServicesUseCase } from "@/lib/composition";
import { ModerationList, type PendingServiceView } from "@/components/servicios/moderation-list";
import { Card, CardBody } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
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

  const { items } = await listPendingServicesUseCase().execute({ page: 1, pageSize: 50 });
  const views: PendingServiceView[] = items.map((s) => ({
    id: s.id,
    title: s.title,
    category: s.category,
    description: s.description,
    contactPhone: s.contactPhone,
    submitterEmail: s.submitterEmail,
    createdAt: formatDate(s.createdAt),
  }));

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Servicios solidarios — revisión</h1>
        <p className="text-sm text-text-2">
          Aprueba o rechaza las publicaciones pendientes. Solo lo aprobado aparece en el directorio
          público.
        </p>
      </div>
      <ModerationList items={views} />
    </div>
  );
}
