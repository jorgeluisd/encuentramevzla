"use client";

import { useActionState } from "react";
import {
  approveServiceAction,
  rejectServiceAction,
  type EstadoModeracion,
} from "@/lib/actions/servicios";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

const initial: EstadoModeracion = { ok: false };

export interface PendingServiceView {
  id: string;
  title: string;
  category: string;
  description: string;
  contactPhone: string;
  submitterEmail: string;
  createdAt: string;
}

function ModerationRow({ item }: { item: PendingServiceView }): React.ReactElement {
  const [approveState, approveForm, approvePending] = useActionState(approveServiceAction, initial);
  const [rejectState, rejectForm, rejectPending] = useActionState(rejectServiceAction, initial);
  const msg = approveState.mensaje ?? rejectState.mensaje;
  const ok = approveState.ok || rejectState.ok;

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="primary">{item.category}</Badge>
          <span className="text-xs text-text-3">{item.createdAt}</span>
        </div>
        <h3 className="text-lg font-semibold text-text">{item.title}</h3>
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
          <form action={approveForm}>
            <input type="hidden" name="serviceId" value={item.id} />
            <Button type="submit" disabled={approvePending || rejectPending}>
              {approvePending ? "Aprobando…" : "Aprobar"}
            </Button>
          </form>
          <form action={rejectForm} className="flex flex-1 flex-wrap items-center gap-2">
            <input type="hidden" name="serviceId" value={item.id} />
            <input
              name="reason"
              placeholder="Motivo del rechazo (opcional)"
              className="h-[52px] min-w-[12rem] flex-1 rounded-[var(--radius-control)] border border-border bg-bg px-4 text-text placeholder:text-text-3 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
            />
            <Button type="submit" variant="outline" disabled={approvePending || rejectPending}>
              {rejectPending ? "Rechazando…" : "Rechazar"}
            </Button>
          </form>
        </div>

        {msg && (
          <p
            className={`rounded-[var(--radius-control)] px-4 py-3 text-sm ${ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}
            role="status"
          >
            {msg}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

export function ModerationList({ items }: { items: PendingServiceView[] }): React.ReactElement {
  if (items.length === 0) {
    return (
      <Card>
        <CardBody className="py-10 text-center text-text-2">
          No hay publicaciones pendientes de revisión.
        </CardBody>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <ModerationRow key={item.id} item={item} />
      ))}
    </div>
  );
}
