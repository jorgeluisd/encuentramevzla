import { canAccessReviewQueue, displayName, type ReviewCase } from "@evzla/core";
import { getCurrentMember } from "@/lib/auth/current-member";
import { listReviewQueueUseCase } from "@/lib/composition";
import { resolveReviewAction } from "@/lib/actions/review";
import { ReviewCaseActions } from "./review-case-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * `/admin/review` — Cola de revisión humana (triage). Moderador (toda) o hospital_admin (la de
 * su hospital, P5). Muestra los casos dudosos de la dedup con sus candidatos y registra la decisión.
 */
export default async function ReviewPage(): Promise<React.ReactElement> {
  const current = await getCurrentMember();
  if (current.kind !== "authorized" || !canAccessReviewQueue(current.member.role)) {
    return (
      <Card className="border-warning/30 bg-warning/5">
        <CardBody className="text-sm text-warning">
          Esta sección es solo para moderadores y administradores de hospital.
        </CardBody>
      </Card>
    );
  }

  // El hospital_admin solo ve su cola; el moderador global, toda.
  const scopeHospitalId =
    current.member.role === "moderator" ? null : current.member.hospitalId;
  const cases = await listReviewQueueUseCase().execute({ scopeHospitalId });

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold sm:text-2xl">Revisión humana</h1>
        <p className="text-text-2">
          Casos que la deduplicación no pudo resolver sola. Decide si son la misma
          persona. Por ahora se registra tu decisión; la fusión real se aplicará en un
          paso posterior.
        </p>
      </header>

      {cases.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-text-3">
            No hay casos pendientes de revisión.
          </CardBody>
        </Card>
      ) : (
        cases.map((c) => <ReviewCaseCard key={c.patientId} item={c} />)
      )}
    </div>
  );
}

function ReviewCaseCard({ item }: { item: ReviewCase }): React.ReactElement {
  const candidateId = item.candidates[0]?.id ?? "";
  const reasonLabel =
    item.reason === "document_conflict" ? "Conflicto de cédula" : "Zona gris";

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Badge variant="warning">{reasonLabel}</Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-sm text-text-3">Registro nuevo</p>
            <p className="font-medium text-text">{displayName(item.name)}</p>
          </div>
          <div>
            <p className="text-sm text-text-3">
              {item.reason === "document_conflict"
                ? "Misma cédula que"
                : "Se parece a"}
            </p>
            {item.candidates.length === 0 ? (
              <p className="text-text-3">No se encontró candidato.</p>
            ) : (
              <ul className="space-y-0.5">
                {item.candidates.map((cand) => (
                  <li key={cand.id} className="font-medium text-text">
                    {displayName(cand.name)}
                    {cand.document && (
                      <span className="ml-1 text-sm text-text-3">
                        · {cand.document}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <ReviewCaseActions
          patientId={item.patientId}
          candidateId={candidateId}
          action={resolveReviewAction}
          source={{ name: displayName(item.name), hospitals: item.hospitals }}
          candidate={
            item.candidates[0]
              ? {
                  name: displayName(item.candidates[0].name),
                  document: item.candidates[0].document,
                  hospitals: item.candidates[0].hospitals ?? [],
                }
              : null
          }
        />
      </CardBody>
    </Card>
  );
}
