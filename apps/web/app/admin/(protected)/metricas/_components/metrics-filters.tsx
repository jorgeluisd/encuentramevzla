"use client";

import { useRouter } from "next/navigation";

export interface HospitalOption {
  id: string;
  name: string;
}

const BASE = "/admin/metricas";

const RANGES = [
  { value: "7d", label: "Últimos 7 días" },
  { value: "30d", label: "Últimos 30 días" },
  { value: "90d", label: "Últimos 90 días" },
];

const selectClass =
  "rounded-[var(--radius-control)] border border-border bg-bg px-3 py-2 text-sm text-text";

/**
 * Filtros reutilizables del dashboard: hospital (centro canónico) + rango temporal.
 * Los valores actuales llegan por props desde el server; se navega con `useRouter`
 * (sin `useSearchParams`, que en prod requiere Suspense — patrón del resto del admin).
 */
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

  // Reconstruye la URL desde los props actuales + el valor que cambió (preserva ambos filtros).
  const navigate = (nextHospital: string | null, nextRange: string): void => {
    const params = new URLSearchParams();
    if (nextHospital) params.set("hospital", nextHospital);
    if (nextRange) params.set("range", nextRange);
    const qs = params.toString();
    router.push(qs ? `${BASE}?${qs}` : BASE);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-text-2">
        Hospital
        <select
          className={selectClass}
          value={hospitalId ?? ""}
          onChange={(e) => navigate(e.target.value || null, range)}
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
          onChange={(e) => navigate(hospitalId, e.target.value)}
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
