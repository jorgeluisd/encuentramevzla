"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export interface PatientDetail {
  name: string;
  document?: string | null;
  hospitals: string[];
}

interface ReviewCaseActionsProps {
  patientId: string;
  candidateId: string;
  action: (decision: string, formData: FormData) => Promise<void>;
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

// Submit con feedback "Procesando…" (useFormStatus es por <form>).
function SubmitButton({
  decision,
  label,
  variant,
  action,
}: {
  decision: "merge" | "keep";
  label: string;
  variant?: "primary" | "outline";
  action: ReviewCaseActionsProps["action"];
}): React.ReactElement {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      formAction={action.bind(null, decision)}
      disabled={pending}
      className="w-full sm:w-auto"
    >
      {pending ? (
        <>
          <Spinner /> Procesando…
        </>
      ) : (
        label
      )}
    </Button>
  );
}

function DetailLine({ label, d }: { label: string; d: PatientDetail }): React.ReactElement {
  return (
    <div>
      <p className="text-text-3">{label}</p>
      <p className="font-medium text-text">
        {d.name}
        {d.document ? <span className="ml-1 text-text-2">· {d.document}</span> : null}
      </p>
      <p className="text-text-2">
        Hospital(es): {d.hospitals.length > 0 ? d.hospitals.join(", ") : "—"}
      </p>
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
  const [showDetail, setShowDetail] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const hidden = (
    <>
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="candidateId" value={candidateId} />
    </>
  );

  // Confirmación inline de la fusión (irreversible): muestra quién sobrevive y quién se elimina.
  if (confirming) {
    return (
      <div className="space-y-3 border-t border-border pt-3">
        <div className="space-y-2 rounded-[var(--radius-control)] border border-warning/40 bg-warning/5 p-3 text-sm">
          <p className="font-medium text-text">¿Confirmás la fusión?</p>
          {candidate ? <DetailLine label="Sobrevive" d={candidate} /> : null}
          <DetailLine label="Se elimina (sus ingresos pasan al que sobrevive)" d={source} />
          <p className="font-medium text-danger">Esta acción no se puede deshacer.</p>
        </div>
        <form className="flex flex-col gap-2 sm:flex-row" aria-live="polite">
          {hidden}
          <SubmitButton decision="merge" label="Confirmar fusión" action={action} />
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirming(false)}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t border-border pt-3">
      {showDetail && (
        <div className="space-y-2 rounded-[var(--radius-control)] bg-surface p-3 text-sm">
          <DetailLine label="Registro nuevo (se elimina al fusionar)" d={source} />
          {candidate ? (
            <>
              <DetailLine label="Candidato (sobrevive a la fusión)" d={candidate} />
              <p className="text-text-3">
                Al fusionar, <span className="font-medium text-text">sobrevive {candidate.name}</span>{" "}
                y se elimina {source.name}; sus ingresos se trasladan al que sobrevive.
              </p>
            </>
          ) : (
            <p className="text-text-3">No hay candidato para comparar.</p>
          )}
        </div>
      )}

      <form className="flex flex-col gap-2 sm:flex-row" aria-live="polite">
        {hidden}
        <Button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={!candidate}
          className="w-full sm:w-auto"
        >
          Fusionar
        </Button>
        <SubmitButton decision="keep" label="Mantener separados" variant="outline" action={action} />
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowDetail((v) => !v)}
          className="w-full sm:w-auto"
        >
          {showDetail ? "Ocultar detalle" : "Más info"}
        </Button>
      </form>
    </div>
  );
}
