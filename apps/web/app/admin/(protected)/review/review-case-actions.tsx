"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

type Decision = "merge" | "keep";

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

// Botón de decisión (submit): muestra "Procesando…" mientras corre y deshabilita todo.
function DecisionButton({
  decision,
  label,
  variant,
  action,
  clicked,
  onPick,
}: {
  decision: Decision;
  label: string;
  variant?: "primary" | "outline";
  action: ReviewCaseActionsProps["action"];
  clicked: Decision | null;
  onPick: (d: Decision) => void;
}): React.ReactElement {
  const { pending } = useFormStatus();
  const busy = pending && clicked === decision;
  return (
    <Button
      type="submit"
      variant={variant}
      formAction={action.bind(null, decision)}
      disabled={pending}
      onClick={() => onPick(decision)}
      className="w-full sm:w-auto"
    >
      {busy ? (
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
  const [clicked, setClicked] = useState<Decision | null>(null);
  const [showDetail, setShowDetail] = useState(false);

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
        <input type="hidden" name="patientId" value={patientId} />
        <input type="hidden" name="candidateId" value={candidateId} />
        <DecisionButton
          decision="merge"
          label="Fusionar"
          action={action}
          clicked={clicked}
          onPick={setClicked}
        />
        <DecisionButton
          decision="keep"
          label="Mantener separados"
          variant="outline"
          action={action}
          clicked={clicked}
          onPick={setClicked}
        />
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
