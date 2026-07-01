import { canAccessReviewQueue, displayName, type ReviewCase } from "@evzla/core";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth/current-member";
import { listReviewQueueUseCase } from "@/lib/composition";
import { resolveReviewAction } from "@/lib/actions/review";
import { ReviewCaseActions } from "./review-case-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

/**
 * `/admin/review` — Cola de revisión humana (triage). Moderador (toda) o hospital_admin (la de
 * su hospital, P5). Pagina en SQL: cada página solo trae —y recalcula— sus ~20 casos.
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}): Promise<React.ReactElement> {
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

  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const { cases, total } = await listReviewQueueUseCase().execute({
    scopeHospitalId,
    page,
    pageSize: PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Clamp: al resolver el último caso de la última página, esta queda vacía → retrocede sola.
  if (page > totalPages) redirect(`/admin/review?page=${totalPages}`);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold sm:text-2xl">Revisión humana</h1>
        <p className="text-text-2">
          Casos que la deduplicación no pudo resolver sola. Decide si son la misma
          persona. La fusión es definitiva: el candidato sobrevive y el registro nuevo se
          elimina.
        </p>
      </header>

      {total === 0 ? (
        <Card>
          <CardBody className="text-sm text-text-3">
            No hay casos pendientes de revisión.
          </CardBody>
        </Card>
      ) : (
        <>
          {cases.map((c) => (
            <ReviewCaseCard key={c.patientId} item={c} />
          ))}
          <Pagination page={page} totalPages={totalPages} total={total} />
        </>
      )}
    </div>
  );
}

// Link estilado como botón outline; deshabilitado = span inerte (un <a> no soporta disabled).
function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const base = cn(
    "inline-flex h-11 items-center justify-center rounded-[var(--radius-control)] border border-border px-4 text-sm font-semibold transition-colors",
    "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
    disabled ? "pointer-events-none opacity-50" : "bg-bg text-text hover:bg-surface",
  );
  if (disabled) {
    return (
      <span className={base} aria-disabled>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={base}>
      {children}
    </Link>
  );
}

function Pagination({
  page,
  totalPages,
  total,
}: {
  page: number;
  totalPages: number;
  total: number;
}): React.ReactElement {
  const href = (p: number): string => (p <= 1 ? "/admin/review" : `/admin/review?page=${p}`);
  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <p className="text-sm text-text-3">
        Página {page} de {totalPages} · {total} caso{total === 1 ? "" : "s"}
      </p>
      {totalPages > 1 && (
        <div className="flex gap-2">
          <PageLink href={href(page - 1)} disabled={page <= 1}>
            Anterior
          </PageLink>
          <PageLink href={href(page + 1)} disabled={page >= totalPages}>
            Siguiente
          </PageLink>
        </div>
      )}
    </div>
  );
}

function Cedula({ value }: { value: string | null | undefined }): React.ReactElement {
  return value ? (
    <span className="ml-1 text-sm text-text-3">· Cédula {value}</span>
  ) : (
    <span className="ml-1 text-sm text-text-3">· sin cédula</span>
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
            <p className="font-medium text-text">
              {displayName(item.name)}
              <Cedula value={item.document} />
            </p>
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
                    <Cedula value={cand.document} />
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
          source={{
            name: displayName(item.name),
            document: item.document,
            hospitals: item.hospitals,
          }}
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
