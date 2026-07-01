"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

interface HospitalOption {
  id: string;
  name: string;
}

interface ForeignRowActionsProps {
  fingerprint: string;
  hospitals: HospitalOption[];
  action: (decision: string, formData: FormData) => Promise<void>;
}

function SubmitButton({
  decision,
  label,
  variant,
  action,
}: {
  decision: "reassign" | "discard";
  label: string;
  variant?: "primary" | "outline";
  action: ForeignRowActionsProps["action"];
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
      {pending ? "Procesando…" : label}
    </Button>
  );
}

export function ForeignRowActions({
  fingerprint,
  hospitals,
  action,
}: ForeignRowActionsProps): React.ReactElement {
  return (
    <form className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center" aria-live="polite">
      <input type="hidden" name="fingerprint" value={fingerprint} />
      <select
        name="hospitalId"
        defaultValue=""
        className="rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 text-sm"
      >
        <option value="" disabled>
          Reasignar a…
        </option>
        {hospitals.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
      </select>
      <SubmitButton decision="reassign" label="Reasignar" action={action} />
      <SubmitButton decision="discard" label="Descartar" variant="outline" action={action} />
    </form>
  );
}
