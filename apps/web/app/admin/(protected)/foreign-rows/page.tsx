import { canModerate } from "@evzla/core";
import { getCurrentMember } from "@/lib/auth/current-member";
import { foreignRowsReader, hospitalDirectory } from "@/lib/composition";
import { resolveForeignRowAction } from "@/lib/actions/foreign-rows";
import { ForeignRowActions } from "./foreign-row-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * `/admin/foreign-rows` — Filas que una carga scoped apartó por nombrar OTRO hospital
 * (ADR-0006). El moderador las reasigna al hospital correcto o las descarta. Solo moderador.
 */
export default async function ForeignRowsPage(): Promise<React.ReactElement> {
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

  const [rows, hospitals] = await Promise.all([
    foreignRowsReader().listOpen(),
    hospitalDirectory().listActive(),
  ]);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold sm:text-2xl">Filas de otro hospital</h1>
        <p className="text-text-2">
          Filas que una carga acotada apartó por nombrar un hospital distinto al del
          miembro. No se atribuyeron a nadie. Reasignalas al hospital correcto o descartalas.
        </p>
      </header>

      {rows.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-text-3">No hay filas pendientes.</CardBody>
        </Card>
      ) : (
        rows.map((r) => (
          <Card key={r.fingerprint}>
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-text">{r.fullName ?? "(sin nombre)"}</p>
                <Badge variant="warning">Hospital ajeno: {r.hospitalName}</Badge>
              </div>
              <ForeignRowActions
                fingerprint={r.fingerprint}
                hospitals={hospitals}
                action={resolveForeignRowAction}
              />
            </CardBody>
          </Card>
        ))
      )}
    </div>
  );
}
