import { auditActionLabel, canModerate } from "@evzla/core";
import { getCurrentMember } from "@/lib/auth/current-member";
import { listAuditLogUseCase } from "@/lib/composition";
import { Card, CardBody } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * `/admin/audit` — Rastro del audit_log. Solo MODERADOR (el layout ya garantiza
 * membresía; aquí se exige el rol). Lectura, no acción.
 */
export default async function AuditPage(): Promise<React.ReactElement> {
  const current = await getCurrentMember();
  if (current.kind !== "authorized" || !canModerate(current.member.role)) {
    return (
      <Card className="border-warning/30 bg-warning/5">
        <CardBody className="text-sm text-warning">
          Esta sección es solo para moderadores.
        </CardBody>
      </Card>
    );
  }

  const records = await listAuditLogUseCase().execute(50);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold sm:text-2xl">Audit log</h1>
        <p className="text-text-2">
          Rastro de las últimas acciones del equipo (cargas, conflictos y zona gris).
        </p>
      </header>

      <Card>
        <CardBody>
          {records.length === 0 ? (
            <p className="text-sm text-text-3">Aún no hay registros.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-text-3">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-4 font-medium">Acción</th>
                    <th className="py-2 pr-4 font-medium">Entidad</th>
                    <th className="py-2 pr-4 font-medium">Quién</th>
                    <th className="py-2 font-medium">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4 font-medium text-text">
                        {auditActionLabel(r.action)}
                      </td>
                      <td className="py-2 pr-4 text-text-2">{r.entity}</td>
                      <td className="py-2 pr-4 text-text-2">
                        {r.actorEmail ?? "—"}
                      </td>
                      <td className="py-2 whitespace-nowrap text-text-2">
                        {r.createdAt.toLocaleString("es-VE", {
                          timeZone: "America/Caracas",
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
