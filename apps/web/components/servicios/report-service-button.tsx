"use client";

import { useActionState, useState } from "react";
import { reportServiceAction, type ReportState } from "@/lib/actions/servicios";
import { TurnstileField } from "@/components/servicios/turnstile-field";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

const initial: ReportState = { status: "idle" };

// Botón "Reportar" en cada tarjeta pública. Abre un modal con Turnstile (anti-bot);
// al confirmar, marca la publicación para revisión (no la baja del directorio).
export function ReportServiceButton({ serviceId }: { serviceId: string }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(reportServiceAction, initial);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-text-3 transition-colors hover:text-danger"
      >
        Reportar
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Reportar publicación">
        {state.status === "done" ? (
          <div className="space-y-4">
            <p className="text-sm text-text-2">
              Gracias. Un moderador revisará esta publicación. La publicación sigue visible mientras
              tanto.
            </p>
            <Button type="button" onClick={() => setOpen(false)}>
              Cerrar
            </Button>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="serviceId" value={serviceId} />
            <p className="text-sm text-text-2">
              ¿Reportar esta publicación por ser falsa, abusiva, comercial o inapropiada? Un moderador
              la revisará.
            </p>
            <div className="space-y-1.5">
              <label htmlFor={`reason-${serviceId}`} className="text-sm font-medium text-text-2">
                Motivo <span className="text-text-3">(breve)</span>
              </label>
              <input
                id={`reason-${serviceId}`}
                name="reason"
                maxLength={200}
                placeholder="Ej. es un servicio de pago"
                className="h-[52px] w-full rounded-[var(--radius-control)] border border-border bg-bg px-4 text-text placeholder:text-text-3 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
              />
            </div>
            <TurnstileField resetSignal={state} />
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Enviando…" : "Reportar"}
            </Button>
            {state.status === "verification-failed" && (
              <p className="rounded-[var(--radius-control)] bg-warning/10 px-4 py-2 text-sm text-warning" role="alert">
                No pudimos verificar la solicitud. Intenta de nuevo.
              </p>
            )}
            {state.status === "error" && (
              <p className="rounded-[var(--radius-control)] bg-danger/10 px-4 py-2 text-sm text-danger" role="alert">
                No se pudo reportar. Intenta de nuevo.
              </p>
            )}
          </form>
        )}
      </Modal>
    </>
  );
}
