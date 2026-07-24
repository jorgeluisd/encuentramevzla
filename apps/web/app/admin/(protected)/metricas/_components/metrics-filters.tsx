"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface HospitalOption {
  id: string;
  name: string;
}

const RANGES = [
  { value: "7d", label: "Últimos 7 días" },
  { value: "30d", label: "Últimos 30 días" },
  { value: "90d", label: "Últimos 90 días" },
];

const selectClass =
  "rounded-[var(--radius-control)] border border-border bg-bg px-3 py-2 text-sm text-text";

/** Filtros reutilizables del dashboard: hospital (centro canónico) + rango temporal. */
export function MetricsFilters({
  hospitals,
  hospitalId,
  range,
}: {
  hospitals: HospitalOption[];
  hospitalId: string | null;
  range: string;
}): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = (key: string, value: string | null): void => {
    const next = new URLSearchParams(params.toString());
    if (!value) next.delete(key);
    else next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-text-2">
        Hospital
        <select
          className={selectClass}
          value={hospitalId ?? ""}
          onChange={(e) => setParam("hospital", e.target.value || null)}
        >
          <option value="">Todos</option>
          {hospitals.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm text-text-2">
        Rango (búsquedas)
        <select
          className={selectClass}
          value={range}
          onChange={(e) => setParam("range", e.target.value)}
        >
          {RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
