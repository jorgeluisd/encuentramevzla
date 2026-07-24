type Tone = "primary" | "warning" | "danger" | "success" | "muted";

const BAR: Record<Tone, string> = {
  primary: "var(--color-primary)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
  success: "var(--color-success)",
  muted: "var(--color-muted)",
};

export interface BarItem {
  label: string;
  value: number;
  tone?: Tone;
  secondary?: string; // texto a la derecha (p.ej. "de 60")
}

const fmt = (n: number): string => n.toLocaleString("es-VE");

/**
 * Ranking/desglose por magnitud: la identidad la lleva la ETIQUETA, no el color
 * (accesible sin paleta categórica). Barra fina con extremos redondeados.
 */
export function BarList({
  items,
  max,
  emptyLabel = "Sin datos.",
}: {
  items: BarItem[];
  max?: number;
  emptyLabel?: string;
}): React.ReactElement {
  if (items.length === 0) {
    return <p className="text-sm text-text-3">{emptyLabel}</p>;
  }
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">
      {items.map((it, i) => {
        const pct = top > 0 ? (it.value / top) * 100 : 0;
        return (
          <li key={`${it.label}-${i}`}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-text">{it.label}</span>
              <span className="shrink-0 tabular-nums text-text-2">
                {fmt(it.value)}
                {it.secondary ? (
                  <span className="ml-1 text-text-3">{it.secondary}</span>
                ) : null}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-alt">
              <div
                className="h-2 rounded-full"
                style={{
                  width: `${it.value > 0 ? Math.max(pct, 2) : 0}%`,
                  backgroundColor: BAR[it.tone ?? "primary"],
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
