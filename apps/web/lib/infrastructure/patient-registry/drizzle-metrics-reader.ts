import { sql } from "drizzle-orm";
import type { getDb } from "@evzla/db/client";
import type {
  CoverageRaw,
  HospitalRowRaw,
  MetricsGranularity,
  MetricsRange,
  MetricsReader,
  PatientCountsRaw,
  ProvenanceRaw,
  ReviewCountsRaw,
  SearchResultType,
  SearchStatsRaw,
} from "@evzla/core";

type Db = ReturnType<typeof getDb>;
type Row = Record<string, unknown>;

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

/**
 * Lectura de AGREGADOS para el dashboard /admin/metricas (spec 0024). Solo conteos y
 * series — nunca filas de paciente ni datos de `sensitive`. Server-side (Drizzle directo).
 * `hospitalId` acota vía `admissions` al centro canónico; `null` = global.
 */
export class DrizzleMetricsReader implements MetricsReader {
  constructor(private readonly db: Db) {}

  // EXISTS reutilizable: acota los pacientes al hospital seleccionado (vía admissions).
  private patientScope(hospitalId: string | null) {
    return hospitalId
      ? sql`and exists (select 1 from public.admissions a where a.patient_id = p.id and a.hospital_id = ${hospitalId})`
      : sql``;
  }

  // Timeout por query: en serverless una conexión colgada dejaría la función esperando
  // hasta maxDuration. Con esto un cuelgue se vuelve un error atrapable (card amable).
  private exec(query: ReturnType<typeof sql>, label: string): Promise<Row[]> {
    const TIMEOUT_MS = 8000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`metrics query timeout: ${label}`)), TIMEOUT_MS);
    });
    return Promise.race([this.db.execute(query) as unknown as Promise<Row[]>, timeout]).finally(
      () => clearTimeout(timer),
    );
  }

  async patientCounts(hospitalId: string | null): Promise<PatientCountsRaw> {
    const scope = this.patientScope(hospitalId);
    const rows = await this.exec(sql`
      select
        count(*)::int as total,
        count(*) filter (where p.normalized_doc_number is not null)::int as with_document,
        count(*) filter (where p.normalized_doc_number is null)::int as without_document,
        count(*) filter (where p.is_minor)::int as minors,
        count(*) filter (where p.status = 'deceased')::int as deceased,
        count(*) filter (where p.status = 'admitted')::int as st_admitted,
        count(*) filter (where p.status = 'transferred')::int as st_transferred,
        count(*) filter (where p.status = 'discharged')::int as st_discharged,
        count(*) filter (where p.status = 'located')::int as st_located,
        count(*) filter (where p.status = 'deceased')::int as st_deceased
      from public.patients p
      where true ${scope}
    `, "metrics");
    const r = rows[0] ?? {};
    return {
      total: num(r.total),
      withDocument: num(r.with_document),
      withoutDocument: num(r.without_document),
      minors: num(r.minors),
      deceased: num(r.deceased),
      byStatus: {
        admitted: num(r.st_admitted),
        transferred: num(r.st_transferred),
        discharged: num(r.st_discharged),
        located: num(r.st_located),
        deceased: num(r.st_deceased),
      },
    };
  }

  async hospitalBreakdown(): Promise<HospitalRowRaw[]> {
    // LEFT JOIN para incluir hospitales sin pacientes; distinct evita contar de más
    // cuando un paciente tiene varios ingresos en el mismo centro.
    const rows = await this.exec(sql`
      select
        h.id as hospital_id,
        h.name,
        h.city,
        h.provisional,
        h.active,
        h.test,
        count(distinct p.id)::int as patients,
        count(distinct p.id) filter (where p.normalized_doc_number is null)::int as without_document,
        count(distinct p.id) filter (where p.is_minor)::int as minors
      from public.hospitals h
      left join public.admissions a on a.hospital_id = h.id
      left join public.patients p on p.id = a.patient_id
      group by h.id, h.name, h.city, h.provisional, h.active, h.test
    `, "metrics");
    return rows.map((r) => ({
      hospitalId: String(r.hospital_id),
      name: String(r.name),
      city: r.city == null ? null : String(r.city),
      provisional: Boolean(r.provisional),
      active: Boolean(r.active),
      test: Boolean(r.test),
      patients: num(r.patients),
      withoutDocument: num(r.without_document),
      minors: num(r.minors),
    }));
  }

  async reviewCounts(hospitalId: string | null): Promise<ReviewCountsRaw> {
    // Cola derivada de audit_log: dedup_* sin un review_resolved posterior.
    const scope = hospitalId
      ? sql`and exists (select 1 from public.admissions a where a.patient_id = al.entity_id and a.hospital_id = ${hospitalId})`
      : sql``;
    const rows = await this.exec(sql`
      select
        count(*) filter (where al.action = 'dedup_document_conflict')::int as document_conflict,
        count(*) filter (where al.action = 'dedup_pending_review')::int as pending_review
      from public.audit_log al
      where al.action in ('dedup_document_conflict', 'dedup_pending_review')
        and al.entity_id is not null
        and al.entity_id not in (
          select entity_id from public.audit_log
          where action = 'review_resolved' and entity_id is not null
        )
        ${scope}
    `, "metrics");
    const r = rows[0] ?? {};
    return {
      documentConflict: num(r.document_conflict),
      pendingReview: num(r.pending_review),
    };
  }

  async coverage(hospitalId: string | null): Promise<CoverageRaw> {
    const scope = this.patientScope(hospitalId);
    const rows = await this.exec(sql`
      select
        count(*)::int as total,
        count(*) filter (where p.normalized_doc_number is null)::int as missing_document,
        count(*) filter (where p.age is null)::int as missing_age
      from public.patients p
      where true ${scope}
    `, "metrics");
    const r = rows[0] ?? {};
    return {
      total: num(r.total),
      missingDocument: num(r.missing_document),
      missingAge: num(r.missing_age),
    };
  }

  async provenance(hospitalId: string | null): Promise<ProvenanceRaw> {
    const scope = hospitalId
      ? sql`and exists (select 1 from public.admissions a where a.patient_id = pp.patient_id and a.hospital_id = ${hospitalId})`
      : sql``;
    const rows = await this.exec(sql`
      select
        ib.id as ingest_batch_id,
        ib.kind,
        pp.source_kind,
        count(distinct pp.patient_id)::int as patients
      from public.patient_provenance pp
      join public.ingest_batch ib on ib.id = pp.ingest_batch_id
      where true ${scope}
      group by ib.id, ib.kind, pp.source_kind, ib.created_at
      order by ib.created_at asc
    `, "metrics");
    return {
      batches: rows.map((r) => ({
        ingestBatchId: String(r.ingest_batch_id),
        kind: String(r.kind),
        sourceKind: r.source_kind === "enrich" ? "enrich" : "import",
        patients: num(r.patients),
      })),
    };
  }

  async searchStats(
    range: MetricsRange,
    granularity: MetricsGranularity,
  ): Promise<SearchStatsRaw> {
    // Solo conteos por result_type y volumen temporal. search_log guarda solo hash.
    const trunc =
      granularity === "week"
        ? sql`date_trunc('week', created_at)`
        : sql`date_trunc('day', created_at)`;
    // Ventana [from, to] inclusiva por día.
    const window = sql`created_at >= ${range.from}::date and created_at < (${range.to}::date + 1)`;

    const byTypeRows = await this.exec(sql`
      select result_type, count(*)::int as n
      from public.search_log
      where ${window}
      group by result_type
    `, "metrics");

    const byResultType: Record<SearchResultType, number> = {
      matches: 0,
      no_results: 0,
      requires_human_contact: 0,
      invalid_term: 0,
      rate_limited: 0,
    };
    for (const r of byTypeRows) {
      const key = String(r.result_type) as SearchResultType;
      if (key in byResultType) byResultType[key] = num(r.n);
    }

    const seriesRows = await this.exec(sql`
      select to_char(${trunc}, 'YYYY-MM-DD') as date, count(*)::int as count
      from public.search_log
      where ${window}
      group by 1
      order by 1 asc
    `, "metrics");

    return {
      byResultType,
      series: seriesRows.map((r) => ({ date: String(r.date), count: num(r.count) })),
    };
  }
}
