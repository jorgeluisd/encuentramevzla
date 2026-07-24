import { cn } from "@/lib/utils";

type Tone = "default" | "primary" | "warning" | "danger" | "success";

const TONE: Record<Tone, string> = {
  default: "text-text",
  primary: "text-primary",
  warning: "text-warning",
  danger: "text-danger",
  success: "text-success",
};

/** KPI: número grande + etiqueta + sub-dato opcional. Solo agregados. */
export function StatTile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: Tone;
}): React.ReactElement {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-bg p-4">
      <div className="text-sm text-text-2">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", TONE[tone])}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-text-3">{sub}</div> : null}
    </div>
  );
}
