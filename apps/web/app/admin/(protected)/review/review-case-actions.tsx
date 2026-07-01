"use client";

import { useActionState, useState } from "react";
import type { ReviewActionState } from "@/lib/actions/review";
import { Button } from "@/components/ui/button";

export interface PatientDetail {
  name: string;
  document?: string | null;
  hospitals: string[];
}

interface ReviewCaseActionsProps {
  patientId: string;
  candidateId: string;
  action: (prev: ReviewActionState, formData: FormData) => Promise<ReviewActionState>;
  source: PatientDetail;
  candidate: PatientDetail | null;
}

function Spinner(): React.ReactElement {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden
    />
  );
}

// Ficha de un registro: nombre, cédula (si hay) y sus hospitales en lista (uno por línea).
function DetailLine({ label, d }: { label: string; d: PatientDetail }): React.ReactElement {
  return (
    <div className="space-y-1">
      <p className="text-text-3">{label}</p>
      <p className="font-medium text-text">
        {d.name}
        {d.document ? (
          <span className="ml-1 text-text-2">
            · Cédula {d.document}
          </span>
        ) : (
          <span className="ml-1 text-text-3">· sin cédula</span>
        )}
      </p>
      <div className="text-text-2">
        <span className="text-text-3">Hospital(es):</span>{" "}
        {d.hospitals.length === 0 ? (
          "—"
        ) : (
          <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
            {d.hospitals.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ReviewCaseActions({
  patientId,
  candidateId,
  action,
  source,
  candidate,
}: ReviewCaseActionsProps): React.ReactElement {
  const [state, formAction, pending] = useActionState<ReviewActionState, FormData>(action, {
    error: null,
  });
  const [showDetail, setShowDetail] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const hidden = (
    <>
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="candidateId" value={candidateId} />
    </>
  );

  const errorMsg = state.error ? (
    <p className="text-sm text-danger" role="alert">
      {state.error}
    </p>
  ) : null;

  // Confirmación inline de la fusión (irreversible): muestra quién sobrevive y quién se elimina.
  if (confirming) {
    return (
      <div className="space-y-3 border-t border-border pt-3">
        <div className="space-y-3 rounded-[var(--radius-control)] border border-warning/40 bg-warning/5 p-3 text-sm">
          <p className="font-medium text-text">¿Confirmás la fusión?</p>
          {candidate ? <DetailLine label="Sobrevive" d={candidate} /> : null}
          <div className="border-t border-border" />
          <DetailLine label="Se elimina (sus ingresos pasan al que sobrevive)" d={source} />
          <p className="font-medium text-danger">Esta acción no se puede deshacer.</p>
        </div>
        <form action={formAction} className="flex flex-col gap-2 sm:flex-row" aria-live="polite">
          {hidden}
          <Button
            type="submit"
            name="decision"
            value="merge"
            disabled={pending}
            className="w-full sm:w-auto"
          >
            {pending ? (
              <>
                <Spinner /> Procesando…
              </>
            ) : (
              "Confirmar fusión"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
        </form>
        {errorMsg}
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t border-border pt-3">
      {showDetail && (
        <div className="space-y-3 rounded-[var(--radius-control)] bg-surface p-3 text-sm">
          {candidate ? (
            <>
              <DetailLine label="Candidato (sobrevive a la fusión)" d={candidate} />
              <div className="border-t border-border" />
              <DetailLine label="Registro nuevo (se elimina al fusionar)" d={source} />
              <p className="border-t border-border pt-3 text-text-3">
                Al fusionar, <span className="font-medium text-text">sobrevive {candidate.name}</span>{" "}
                y se elimina {source.name}; sus ingresos se trasladan al que sobrevive.
              </p>
            </>
          ) : (
            <>
              <DetailLine label="Registro nuevo" d={source} />
              <p className="text-text-3">No hay candidato para comparar.</p>
            </>
          )}
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-2 sm:flex-row" aria-live="polite">
        {hidden}
        <Button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={!candidate || pending}
          className="w-full sm:w-auto"
        >
          Fusionar
        </Button>
        <Button
          type="submit"
          name="decision"
          value="keep"
          variant="outline"
          disabled={pending}
          className="w-full sm:w-auto"
        >
          {pending ? (
            <>
              <Spinner /> Procesando…
            </>
          ) : (
            "Mantener separados"
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowDetail((v) => !v)}
          disabled={pending}
          className="w-full sm:w-auto"
        >
          {showDetail ? "Ocultar detalle" : "Más info"}
        </Button>
      </form>
      {errorMsg}
    </div>
  );
}
