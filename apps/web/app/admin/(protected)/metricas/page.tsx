import {
  canModerate,
  type MetricsGranularity,
  type MetricsRange,
  type PatientStatus,
  type SearchResultType,
} from "@evzla/core";
import { getCurrentMember } from "@/lib/auth/current-member";
import { getAdminMetricsUseCase } from "@/lib/composition";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { StatTile } from "./_components/stat-tile";
import { BarList, type BarItem } from "./_components/bar-list";
import { SearchTrend } from "./_components/search-trend";
import { MetricsFilters, type HospitalOption } from "./_components/metrics-filters";

export const dynamic = "force-dynamic";

const fmt = (n: number): string => n.toLocaleString("es-VE");

const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

const STATUS_LABEL: Record<PatientStatus, string> = {
  admitted: "Ingresado",
  transferred: "Trasladado",
  discharged: "De alta",
  located: "Localizado",
  deceased: "Fallecido",
};

const RESULT_LABEL: Record<SearchResultType, string> = {
  matches: "Con coincidencias",
  no_results: "Sin resultados",
  requires_human_contact: "Requiere contacto humano",
  invalid_term: "Término inválido",
  rate_limited: "Límite de tasa",
};

function resolveRange(preset: string): {
  range: MetricsRange;
  granularity: MetricsGranularity;
} {
  const days = RANGE_DAYS[preset] ?? 30;
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - (days - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return { range: { from, to }, granularity: days >= 90 ? "week" : "day" };
}

/**
 * `/admin/metricas` — Dashboard de métricas (spec 0024). Solo MODERADOR. Solo AGREGADOS:
 * conteos, porcentajes y series; jamás filas de paciente ni datos de `sensitive`.
 */
export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ hospital?: string; range?: string }>;
}): Promise<React.ReactElement> {
  const current = await getCurrentMember();
  if (current.kind !== "authorized" || !canModerate(current.member.role)) {
    return (
      <Card className="border-warning/30 bg-warning/5">
        <CardBody className="text-sm text-warning">
          Esta sección es solo para moderadores.
        </CardBody>
      </Card>
    );
  }

  const sp = await searchParams;
  const hospitalId = sp.hospital && sp.hospital.length > 0 ? sp.hospital : null;
  const rangePreset = sp.range && sp.range in RANGE_DAYS ? sp.range : "30d";
  const { range, granularity } = resolveRange(rangePreset);

  const m = await getAdminMetricsUseCase().execute({ hospitalId, range, granularity });

  const hospitalOptions: HospitalOption[] = [...m.hospitals.ranked, ...m.hospitals.withoutPatients]
    .map((h) => ({ id: h.hospitalId, name: h.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const selected = hospitalOptions.find((h) => h.id === hospitalId) ?? null;

  const statusItems: BarItem[] = (Object.keys(STATUS_LABEL) as PatientStatus[]).map((s) => ({
    label: STATUS_LABEL[s],
    value: m.patients.byStatus[s],
    tone: s === "deceased" ? "danger" : s === "located" ? "success" : "primary",
  }));

  const hospitalMarks = (h: { provisional: boolean; test: boolean }): string => {
    const marks = [
      ...(h.provisional ? ["provisional"] : []),
      ...(h.test ? ["prueba"] : []),
    ];
    return marks.length > 0 ? ` · ${marks.join(" · ")}` : "";
  };

  const rankingItems: BarItem[] = m.hospitals.ranked.map((h) => ({
    label: `${h.name}${hospitalMarks(h)}`,
    value: h.patients,
    tone: h.provisional || h.test ? "warning" : "primary",
    secondary: `· sin cédula ${fmt(h.withoutDocument)} · menores ${fmt(h.minors)}`,
  }));

  const reviewItems: BarItem[] = [
    { label: "Conflicto de cédula", value: m.review.documentConflict, tone: "danger" },
    { label: "Revisión pendiente (zona gris)", value: m.review.pendingReview, tone: "warning" },
  ];

  const resultItems: BarItem[] = (Object.keys(RESULT_LABEL) as SearchResultType[]).map((k) => ({
    label: RESULT_LABEL[k],
    value: m.search.byResultType[k],
    tone: k === "matches" ? "success" : k === "rate_limited" ? "danger" : "muted",
  }));

  const provenanceItems: BarItem[] = m.provenance.batches.map((b) => ({
    label: b.sourceKind === "import" ? "Import (reconciliación)" : "Enriquecimiento",
    value: b.patients,
    tone: b.sourceKind === "import" ? "primary" : "success",
    secondary: `· ${b.kind}`,
  }));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold sm:text-2xl">Métricas</h1>
        <p className="text-text-2">
          Panorama agregado del sistema
          {selected ? (
            <>
              {" "}— filtrado por <span className="font-medium text-text">{selected.name}</span>
            </>
          ) : null}
          . Solo conteos y porcentajes; ningún dato de paciente.
        </p>
      </header>

      <MetricsFilters hospitals={hospitalOptions} hospitalId={hospitalId} range={rangePreset} />

      {/* Pacientes */}
      <Card>
        <CardBody className="space-y-4">
          <CardTitle>Pacientes</CardTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile label="Total" value={fmt(m.patients.total)} />
            <StatTile label="Con cédula" value={fmt(m.patients.withDocument)} tone="primary" />
            <StatTile label="Sin cédula" value={fmt(m.patients.withoutDocument)} tone="warning" />
            <StatTile label="Menores" value={fmt(m.patients.minors)} tone="warning" />
            <StatTile label="Fallecidos" value={fmt(m.patients.deceased)} tone="danger" />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-text-2">Por estado</p>
            <BarList items={statusItems} />
          </div>
        </CardBody>
      </Card>

      {/* Cobertura */}
      <Card>
        <CardBody className="space-y-4">
          <CardTitle>Cobertura de datos</CardTitle>
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label="Sin cédula"
              value={`${m.coverage.missingDocumentPct}%`}
              sub={`${fmt(m.coverage.missingDocument)} de ${fmt(m.coverage.total)}`}
              tone="warning"
            />
            <StatTile
              label="Sin edad"
              value={`${m.coverage.missingAgePct}%`}
              sub={`${fmt(m.coverage.missingAge)} de ${fmt(m.coverage.total)}`}
              tone="warning"
            />
          </div>
        </CardBody>
      </Card>

      {/* Por hospital */}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle>Por hospital</CardTitle>
            <p className="text-sm text-text-3">
              {fmt(m.hospitals.total)} centros · {fmt(m.hospitals.provisionalCount)} provisionales ·{" "}
              {fmt(m.hospitals.withoutPatients.length)} sin pacientes
            </p>
          </div>
          <BarList items={rankingItems} emptyLabel="Ningún hospital con pacientes." />
          {m.hospitals.withoutPatients.length > 0 ? (
            <div>
              <p className="mb-1 text-sm font-medium text-text-2">Hospitales sin pacientes</p>
              <p className="text-sm text-text-3">
                {m.hospitals.withoutPatients
                  .map((h) => `${h.name}${hospitalMarks(h)}`)
                  .join(" · ")}
              </p>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* Cola de revisión */}
      <Card>
        <CardBody className="space-y-4">
          <CardTitle>Cola de revisión</CardTitle>
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Abiertos" value={fmt(m.review.open)} tone="primary" />
            <StatTile label="Conflicto cédula" value={fmt(m.review.documentConflict)} tone="danger" />
            <StatTile label="Zona gris" value={fmt(m.review.pendingReview)} tone="warning" />
          </div>
          <BarList items={reviewItems} emptyLabel="Cola vacía." />
        </CardBody>
      </Card>

      {/* Búsquedas (global) */}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle>Búsquedas</CardTitle>
            <p className="text-sm text-text-3">Global · no depende del filtro de hospital</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Total en el rango" value={fmt(m.search.total)} />
            <StatTile label="Tasa de acierto" value={`${m.search.hitRatePct}%`} tone="success" />
          </div>
          <SearchTrend points={m.search.series} />
          <div>
            <p className="mb-2 text-sm font-medium text-text-2">Por resultado</p>
            <BarList items={resultItems} />
          </div>
        </CardBody>
      </Card>

      {/* Procedencia */}
      <Card>
        <CardBody className="space-y-4">
          <CardTitle>Procedencia (reconciliación)</CardTitle>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Importados" value={fmt(m.provenance.imported)} tone="primary" />
            <StatTile label="Enriquecidos" value={fmt(m.provenance.enriched)} tone="success" />
          </div>
          <BarList items={provenanceItems} emptyLabel="Sin lotes de reconciliación." />
        </CardBody>
      </Card>
    </div>
  );
}
