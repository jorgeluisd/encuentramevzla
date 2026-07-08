"use client";

import { useActionState, useMemo, useState } from "react";
import {
  approveServiceAction,
  dismissReportAction,
  rejectServiceAction,
  resendManageLinkAction,
  takeDownServiceAction,
  type EstadoModeracion,
} from "@/lib/actions/servicios";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const initial: EstadoModeracion = { ok: false };

export interface AdminServiceView {
  id: string;
  title: string;
  category: string;
  description: string;
  contactPhone: string;
  submitterEmail: string;
  status: string;
  reported: boolean;
  reportReason: string | null;
  createdAt: string;
  expiresAt: string;
}

const STATUS_META: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  pending: { label: "En revisión", variant: "warning" },
  approved: { label: "Publicada", variant: "success" },
  rejected: { label: "Rechazada", variant: "danger" },
  removed: { label: "Dada de baja", variant: "muted" },
  expired: { label: "Caducada", variant: "muted" },
};

const fieldClass =
  "h-[52px] w-full rounded-[var(--radius-control)] border border-border bg-bg px-4 text-text focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none";

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function Row({ item }: { item: AdminServiceView }): React.ReactElement {
  const [approveState, approveForm, approvePending] = useActionState(approveServiceAction, initial);
  const [rejectState, rejectForm, rejectPending] = useActionState(rejectServiceAction, initial);
  const [dismissState, dismissForm, dismissPending] = useActionState(dismissReportAction, initial);
  const [downState, downForm, downPending] = useActionState(takeDownServiceAction, initial);
  const [resendState, resendForm, resendPending] = useActionState(resendManageLinkAction, initial);
  const msg =
    approveState.mensaje ??
    rejectState.mensaje ??
    dismissState.mensaje ??
    downState.mensaje ??
    resendState.mensaje;
  const ok =
    approveState.ok || rejectState.ok || dismissState.ok || downState.ok || resendState.ok;
  const busy =
    approvePending || rejectPending || dismissPending || downPending || resendPending;

  const meta = STATUS_META[item.status] ?? { label: item.status, variant: "muted" as const };
  const isPending = item.status === "pending";
  const isApproved = item.status === "approved";

  return (
    <Card className={item.reported ? "border-danger/40" : undefined}>
      <CardBody className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {item.reported && <Badge variant="danger">⚑ Reportado</Badge>}
            <Badge variant={meta.variant}>{meta.label}</Badge>
            <Badge variant="primary">{item.category}</Badge>
          </div>
          <span className="text-xs text-text-3">Caduca: {item.expiresAt}</span>
        </div>
        <h3 className="font-semibold text-text">{item.title}</h3>
        {item.reported && item.reportReason && (
          <p className="rounded-[var(--radius-control)] bg-danger/5 px-3 py-2 text-sm text-danger">
            Motivo del reporte: {item.reportReason}
          </p>
        )}
        <p className="text-sm text-text-2">{item.description}</p>
        <dl className="grid gap-1 text-sm text-text-2">
          <div className="flex gap-2">
            <dt className="font-medium">Teléfono:</dt>
            <dd>{item.contactPhone}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium">Correo (privado):</dt>
            <dd>{item.submitterEmail}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-3 pt-1">
          {isPending && (
            <form action={approveForm}>
              <input type="hidden" name="serviceId" value={item.id} />
              <Button type="submit" disabled={busy}>
                {approvePending ? "Aprobando…" : "Aprobar"}
              </Button>
            </form>
          )}
          {item.reported && (
            <form action={dismissForm}>
              <input type="hidden" name="serviceId" value={item.id} />
              <Button type="submit" disabled={busy}>
                {dismissPending ? "Descartando…" : "Descartar reporte"}
              </Button>
            </form>
          )}
          {isPending && (
            <form action={rejectForm} className="flex flex-1 flex-wrap items-center gap-2">
              <input type="hidden" name="serviceId" value={item.id} />
              <input
                name="reason"
                placeholder="Motivo del rechazo (opcional)"
                className="h-[52px] min-w-[12rem] flex-1 rounded-[var(--radius-control)] border border-border bg-bg px-4 text-text placeholder:text-text-3 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
              />
              <Button type="submit" variant="outline" disabled={busy}>
                {rejectPending ? "Rechazando…" : "Rechazar"}
              </Button>
            </form>
          )}
          {isApproved && (
            <form action={downForm}>
              <input type="hidden" name="serviceId" value={item.id} />
              <Button type="submit" variant="danger" disabled={busy}>
                {downPending ? "Dando de baja…" : "Dar de baja"}
              </Button>
            </form>
          )}
          <form action={resendForm}>
            <input type="hidden" name="serviceId" value={item.id} />
            <Button type="submit" variant="outline" disabled={busy}>
              {resendPending ? "Reenviando…" : "Reenviar enlace"}
            </Button>
          </form>
        </div>

        {msg && (
          <p
            className={`mt-1 rounded-[var(--radius-control)] px-4 py-2 text-sm ${ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}
            role="status"
          >
            {msg}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

export function ServicesAdminBrowser({ items }: { items: AdminServiceView[] }): React.ReactElement {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const filtered = useMemo(() => {
    const nq = norm(q.trim());
    return items.filter((s) => {
      if (status === "reported") {
        if (!s.reported) return false;
      } else if (status && s.status !== status) {
        return false;
      }
      if (!nq) return true;
      return norm(s.title).includes(nq) || norm(s.submitterEmail).includes(nq);
    });
  }, [items, q, status]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por título o correo…"
          aria-label="Buscar publicaciones"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={fieldClass}
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          <option value="reported">Reportadas</option>
          <option value="pending">Pendientes de aprobar</option>
          <option value="approved">Publicadas</option>
          <option value="expired">Caducadas</option>
          <option value="rejected">Rechazadas</option>
          <option value="removed">Dadas de baja</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardBody className="py-8 text-center text-sm text-text-2">
            No hay publicaciones que coincidan.
          </CardBody>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {filtered.map((item) => (
              <Row key={item.id} item={item} />
            ))}
          </div>
          <p className="text-center text-xs text-text-3">
            {filtered.length} de {items.length} publicaciones
          </p>
        </>
      )}
    </div>
  );
}
