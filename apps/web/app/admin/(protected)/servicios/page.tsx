import { canModerate, type SolidarityServiceRecord } from "@evzla/core";
import { getCurrentMember } from "@/lib/auth/current-member";
import { listServicesByStatusUseCase } from "@/lib/composition";
import { ModerationList, type PendingServiceView } from "@/components/servicios/moderation-list";
import { Card, CardBody } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
}

function toView(s: SolidarityServiceRecord): PendingServiceView {
  return {
    id: s.id,
    title: s.title,
    category: s.category,
    description: s.description,
    contactPhone: s.contactPhone,
    submitterEmail: s.submitterEmail,
    createdAt: formatDate(s.createdAt),
  };
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

  const [pending, approved] = await Promise.all([
    listServicesByStatusUseCase().execute({ status: "pending", pageSize: 50 }),
    listServicesByStatusUseCase().execute({ status: "approved", pageSize: 100 }),
  ]);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Servicios solidarios — pendientes de revisión</h1>
          <p className="text-sm text-text-2">
            Aprueba o rechaza. Solo lo aprobado aparece en el directorio público.
          </p>
        </div>
        <ModerationList items={pending.items.map(toView)} />
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Publicadas</h2>
          <p className="text-sm text-text-2">
            Si el autor pierde su enlace de gestión, puedes reenviárselo (se genera uno nuevo y el
            anterior deja de funcionar).
          </p>
        </div>
        <ModerationList
          items={approved.items.map(toView)}
          showModeration={false}
          emptyLabel="Aún no hay publicaciones aprobadas."
        />
      </section>
    </div>
  );
}
