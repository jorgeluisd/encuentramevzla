import {
  type CenterAlignment,
  type ConflictingFields,
  type HospitalCandidate,
  matchHospital,
  type MatchInput,
  normalizeHospitalName,
  type ProductionCandidateRow,
  type ProductionPatientRow,
  type ProductionReadModel,
  type ReconciliationReportData,
  type ReconciliationRun,
  type ReconciliationStore,
  type ReportReadModel,
  type RunStatus,
  type StagingRecordInput,
  type StagingRecordRow,
} from "@evzla/core";
import type postgres from "postgres";
import {
  CREATE_RUN_SQL,
  FIND_RUN_BY_HASH_SQL,
  LIST_ALL_PRODUCTION_SQL,
  LOAD_HOSPITAL_ALIASES_SQL,
  LOAD_HOSPITAL_CATALOG_SQL,
  LOAD_PRODUCTION_CANDIDATES_SQL,
  LOAD_STAGING_FOR_RUN_SQL,
  MARK_STATUS_SQL,
  MATCH_COLUMNS,
  REPORT_MATCHES_SQL,
  REPORT_PRODUCTION_COUNT_SQL,
  REPORT_PRODUCTION_INFO_SQL,
  REPORT_RUN_META_SQL,
  REPORT_STAGING_CENTERS_SQL,
  REPORT_STAGING_COUNT_SQL,
  STAGING_COLUMNS,
} from "./reconciliation-sql";

const CHUNK = 1000; // filas por INSERT (bajo el límite de parámetros de Postgres)
const UNMAPPED = "unmapped:"; // prefijo de clave de bloque para pestañas sin hospital en prod

// Adapter Postgres: staging (escritura SOLO en `reconciliation`), lectura de producción
// (SELECT) y armado del reporte. Resuelve pestaña→hospital con catálogo+alias+difuso (ADR-0005).
export class PostgresReconciliationStore
  implements ReconciliationStore, ProductionReadModel, ReportReadModel
{
  private candidatesByHospital: Map<string, ProductionCandidateRow[]> | null = null;
  private catalog: HospitalCandidate[] = [];
  private hospitalNameById = new Map<string, string>();
  private aliasMap = new Map<string, string>();
  private resolveCache = new Map<string, string | null>();
  private overrideByNorm = new Map<string, string>();
  private catalogLoaded = false;

  // `centerOverrides`: mapa manual pestaña(cruda) → nombre de hospital de prod. Corrige los
  // centros que el match difuso no alinea, SIN tocar prod (es config del diagnóstico, no un alias).
  constructor(
    private readonly sql: postgres.Sql,
    private readonly centerOverrides: Record<string, string> = {},
  ) {}

  // ---------- Catálogo de hospitales (para el bloqueo por centro) ----------

  private async ensureCatalog(): Promise<void> {
    if (this.catalogLoaded) return;
    const hospitals = await this.sql.unsafe(LOAD_HOSPITAL_CATALOG_SQL, []);
    this.catalog = hospitals.map((h) => ({
      id: h["id"] as string,
      normalized: normalizeHospitalName(h["name"] as string),
    }));
    for (const h of hospitals) this.hospitalNameById.set(h["id"] as string, h["name"] as string);
    const aliases = await this.sql.unsafe(LOAD_HOSPITAL_ALIASES_SQL, []);
    for (const a of aliases) {
      this.aliasMap.set(a["alias_normalized"] as string, a["hospital_id"] as string);
    }
    // Overrides manuales: resolver el hospital destino contra el catálogo una sola vez.
    for (const [sheet, target] of Object.entries(this.centerOverrides)) {
      const targetNorm = normalizeHospitalName(target);
      const id = this.catalog.find((c) => c.normalized === targetNorm)?.id ?? matchHospital(targetNorm, this.catalog);
      if (id) this.overrideByNorm.set(normalizeHospitalName(sheet), id);
    }
    this.catalogLoaded = true;
  }

  // Pestaña/centro crudo → hospital_id canónico (override → exacto → alias → difuso). null si ninguno.
  private resolveCenterId(rawName: string): string | null {
    const norm = normalizeHospitalName(rawName);
    const cached = this.resolveCache.get(norm);
    if (cached !== undefined) return cached;
    const override = this.overrideByNorm.get(norm) ?? null;
    const exact = override ?? this.catalog.find((c) => c.normalized === norm)?.id ?? null;
    const id = exact ?? this.aliasMap.get(norm) ?? matchHospital(norm, this.catalog);
    this.resolveCache.set(norm, id);
    return id;
  }

  private blockKey(rawName: string): string {
    const id = this.resolveCenterId(rawName);
    return id ?? `${UNMAPPED}${normalizeHospitalName(rawName)}`;
  }

  // ---------- ReconciliationStore ----------

  async findRunByHash(hash: string): Promise<ReconciliationRun | null> {
    const rows = await this.sql.unsafe(FIND_RUN_BY_HASH_SQL, [hash]);
    const row = rows[0];
    if (!row) return null;
    return {
      runId: row["run_id"] as string,
      sourceFileName: row["source_file_name"] as string,
      sourceFileHash: row["source_file_hash"] as string,
    };
  }

  async createRun(run: ReconciliationRun): Promise<void> {
    await this.sql.unsafe(CREATE_RUN_SQL, [run.runId, run.sourceFileName, run.sourceFileHash]);
  }

  async markStatus(runId: string, status: RunStatus): Promise<void> {
    await this.sql.unsafe(MARK_STATUS_SQL, [runId, status]);
  }

  async saveStagingRecords(records: readonly StagingRecordInput[]): Promise<void> {
    for (const chunk of chunked(records, CHUNK)) {
      const rows = chunk.map((r) => ({
        id: r.id,
        run_id: r.runId,
        sheet_name: r.sheetName,
        source_row_number: r.sourceRowNumber,
        raw: this.sql.json(r.raw),
        normalized_name: r.normalizedName,
        name_tokens: r.nameTokens as string[],
        normalized_doc: r.normalizedDoc,
        is_doc_valid: r.isDocValid,
        age: r.age,
        sex: r.sex,
        is_minor: r.isMinor,
        has_uncertainty_marker: r.hasUncertaintyMarker,
        registered_date_raw: r.registeredDateRaw,
        registered_date: r.registeredDate,
        center_from_sheet: r.centerFromSheet,
        center_from_column: r.centerFromColumn,
        center_mismatch: r.centerMismatch,
      }));
      // Tabla LITERAL `reconciliation.staging_patient_record`; columnas desde STAGING_COLUMNS.
      await this.sql`INSERT INTO reconciliation.staging_patient_record ${this.sql(rows, ...STAGING_COLUMNS)}`;
    }
  }

  async loadStagingForRun(runId: string): Promise<StagingRecordRow[]> {
    await this.ensureCatalog();
    const rows = await this.sql.unsafe(LOAD_STAGING_FOR_RUN_SQL, [runId]);
    return rows.map((row) => ({
      id: row["id"] as string,
      sheetName: row["sheet_name"] as string,
      centerCanonical: this.blockKey(row["sheet_name"] as string),
      normalizedName: row["normalized_name"] as string,
      normalizedDoc: (row["normalized_doc"] as string | null) ?? null,
      age: (row["age"] as number | null) ?? null,
      sex: (row["sex"] as string | null) ?? null,
    }));
  }

  async saveMatches(matches: readonly MatchInput[]): Promise<void> {
    for (const chunk of chunked(matches, CHUNK)) {
      const rows = chunk.map((m) => ({
        id: m.id,
        run_id: m.runId,
        staging_record_id: m.stagingRecordId,
        production_record_id: m.productionRecordId,
        related_staging_record_id: m.relatedStagingRecordId,
        category: m.category,
        similarity_score: m.similarityScore,
        conflicting_fields: m.conflictingFields === null ? null : this.sql.json(m.conflictingFields),
        resolution_status: m.resolutionStatus,
      }));
      await this.sql`INSERT INTO reconciliation.reconciliation_match ${this.sql(rows, ...MATCH_COLUMNS)}`;
    }
  }

  // ---------- ProductionReadModel (SOLO lectura) ----------

  async loadCenterCandidates(centerCanonical: string): Promise<ProductionCandidateRow[]> {
    if (!this.candidatesByHospital) {
      const rows = await this.sql.unsafe(LOAD_PRODUCTION_CANDIDATES_SQL, []);
      const map = new Map<string, ProductionCandidateRow[]>();
      for (const row of rows) {
        const hospitalId = row["hospital_id"] as string;
        const candidate: ProductionCandidateRow = {
          id: row["id"] as string,
          normalizedName: row["normalized_name"] as string,
          normalizedDoc: (row["normalized_doc_number"] as string | null) ?? null,
          age: (row["age"] as number | null) ?? null,
          sex: null, // `patients` no tiene sexo
          centerCanonical: hospitalId,
        };
        const list = map.get(hospitalId);
        if (list) list.push(candidate);
        else map.set(hospitalId, [candidate]);
      }
      this.candidatesByHospital = map;
    }
    return this.candidatesByHospital.get(centerCanonical) ?? [];
  }

  async listAllProduction(): Promise<ProductionPatientRow[]> {
    const rows = await this.sql.unsafe(LIST_ALL_PRODUCTION_SQL, []);
    return rows.map((row) => ({
      id: row["id"] as string,
      normalizedName: row["normalized_name"] as string,
      centerCanonical: row["hospital_id"] as string,
      centerName: row["hospital_name"] as string,
      createdAt: toIsoOrNull(row["created_at"]),
    }));
  }

  // ---------- ReportReadModel ----------

  async buildReportData(runId: string): Promise<ReconciliationReportData> {
    await this.ensureCatalog();
    const [meta] = await this.sql.unsafe(REPORT_RUN_META_SQL, [runId]);
    const matchRows = await this.sql.unsafe(REPORT_MATCHES_SQL, [runId]);
    const [{ n: stagingRecords }] = (await this.sql.unsafe(REPORT_STAGING_COUNT_SQL, [runId])) as [
      { n: number },
    ];
    const [{ n: productionRecords }] = (await this.sql.unsafe(REPORT_PRODUCTION_COUNT_SQL, [])) as [
      { n: number },
    ];
    const sheetRows = await this.sql.unsafe(REPORT_STAGING_CENTERS_SQL, [runId]);
    const rawSheets = sheetRows.map((r) => r["center_from_sheet"] as string);

    // Alineación pestaña → hospital (auditable) + conjunto de hospitales cubiertos.
    const centerAlignment: CenterAlignment[] = rawSheets.map((sheet) => {
      const id = this.resolveCenterId(sheet);
      return { sheet, resolvedHospital: id ? (this.hospitalNameById.get(id) ?? null) : null };
    });
    const coveredHospitalIds = new Set(
      rawSheets.map((s) => this.resolveCenterId(s)).filter((id): id is string => id != null),
    );

    const referencedProdIds = [
      ...new Set(
        matchRows
          .map((m) => m["production_record_id"] as string | null)
          .filter((id): id is string => id != null),
      ),
    ];
    const prodInfo = new Map<string, ProdInfo>();
    if (referencedProdIds.length > 0) {
      const info = await this.sql.unsafe(REPORT_PRODUCTION_INFO_SQL, [referencedProdIds]);
      for (const row of info) {
        prodInfo.set(row["id"] as string, {
          name: row["normalized_name"] as string,
          hospitalId: row["hospital_id"] as string,
          hospitalName: row["hospital_name"] as string,
          createdAt: toIsoOrNull(row["created_at"]),
        });
      }
    }

    return assembleReport({
      runId,
      meta: meta as Record<string, unknown> | undefined,
      matchRows: matchRows as unknown as MatchReportRow[],
      stagingRecords,
      productionRecords,
      prodInfo,
      centerAlignment,
      coveredHospitalIds,
      resolveDisplayCenter: (rawSheet) => {
        const id = this.resolveCenterId(rawSheet);
        return id ? (this.hospitalNameById.get(id) ?? rawSheet) : rawSheet;
      },
      generatedAt: new Date().toISOString().slice(0, 10),
    });
  }
}

interface ProdInfo {
  name: string;
  hospitalId: string;
  hospitalName: string;
  createdAt: string | null;
}

interface MatchReportRow {
  category: string;
  similarity_score: string | number | null;
  resolution_status: string;
  production_record_id: string | null;
  staging_record_id: string | null;
  related_staging_record_id: string | null;
  conflicting_fields: ConflictingFields | null;
  center_from_sheet: string | null;
  staging_name: string | null;
  related_name: string | null;
}

interface AssembleInput {
  runId: string;
  meta: Record<string, unknown> | undefined;
  matchRows: MatchReportRow[];
  stagingRecords: number;
  productionRecords: number;
  prodInfo: Map<string, ProdInfo>;
  centerAlignment: CenterAlignment[];
  coveredHospitalIds: Set<string>;
  resolveDisplayCenter: (rawSheet: string) => string;
  generatedAt: string;
}

type CenterRow = ReconciliationReportData["byCenter"][number] & { key: string };

// Agregación en memoria del reporte. Agrupa por hospital CANÓNICO: las filas del Excel y de
// prod del mismo centro físico caen en el mismo bucket (aunque el nombre difiera).
function assembleReport(input: AssembleInput): ReconciliationReportData {
  const { matchRows, prodInfo } = input;
  const totals = {
    onlyInSource: 0,
    matchIdentical: 0,
    matchConflict: 0,
    onlyInProduction: 0,
    dupInSource: 0,
    needsReview: 0,
  };
  const byCenterMap = new Map<string, CenterRow>();
  const bucket = (displayName: string): CenterRow => {
    const key = normalizeHospitalName(displayName) || displayName;
    let b = byCenterMap.get(key);
    if (!b) {
      b = { key, center: displayName, hasSheet: false, onlyInSource: 0, matchIdentical: 0, matchConflict: 0, onlyInProduction: 0, dupInSource: 0 };
      byCenterMap.set(key, b);
    }
    return b;
  };

  const onlyInProduction: ReconciliationReportData["onlyInProduction"] = [];
  const conflictSamples: ReconciliationReportData["conflictSamples"] = [];
  const intraStagingDuplicates: ReconciliationReportData["intraStagingDuplicates"] = [];
  const centersWithoutSheet = new Map<string, string>();
  const scoreBuckets = new Map<string, number>();

  for (const m of matchRows) {
    const score = m.similarity_score == null ? null : Number(m.similarity_score);
    if (m.resolution_status === "needs_review") totals.needsReview++;

    if (m.category === "ONLY_IN_PRODUCTION") {
      totals.onlyInProduction++;
      const info = m.production_record_id ? prodInfo.get(m.production_record_id) : undefined;
      const centerName = info?.hospitalName ?? "(centro desconocido)";
      const b = bucket(centerName);
      b.onlyInProduction++;
      if (info && input.coveredHospitalIds.has(info.hospitalId)) b.hasSheet = true;
      onlyInProduction.push({ center: centerName, patientName: info?.name ?? "(desconocido)", createdAt: info?.createdAt ?? null });
      if (info && !input.coveredHospitalIds.has(info.hospitalId)) centersWithoutSheet.set(info.hospitalId, centerName);
      continue;
    }

    // Filas del lado Excel: display = hospital canónico si la pestaña resolvió, si no la pestaña.
    const displayCenter = input.resolveDisplayCenter(m.center_from_sheet ?? "(sin centro)");
    const b = bucket(displayCenter);
    b.hasSheet = true;

    if (m.category === "ONLY_IN_SOURCE") {
      totals.onlyInSource++;
      b.onlyInSource++;
    } else if (m.category === "MATCH_IDENTICAL") {
      totals.matchIdentical++;
      b.matchIdentical++;
      bumpScore(scoreBuckets, score);
    } else if (m.category === "MATCH_CONFLICT") {
      totals.matchConflict++;
      b.matchConflict++;
      bumpScore(scoreBuckets, score);
      if (conflictSamples.length < 20) {
        const prod = m.production_record_id ? prodInfo.get(m.production_record_id) : undefined;
        conflictSamples.push({ center: displayCenter, stagingName: m.staging_name ?? "", productionName: prod?.name ?? "", fields: m.conflicting_fields ?? {} });
      }
    } else if (m.category === "DUP_IN_SOURCE") {
      totals.dupInSource++;
      b.dupInSource++;
      intraStagingDuplicates.push({ center: displayCenter, nameA: m.related_name ?? "", nameB: m.staging_name ?? "", score: score ?? 0 });
    }
  }

  const byCenter = [...byCenterMap.values()]
    .map(({ key: _key, ...rest }) => rest)
    .sort((a, b) => centerTotal(b) - centerTotal(a));

  return {
    runId: input.runId,
    sourceFileName: (input.meta?.["source_file_name"] as string | undefined) ?? "(desconocido)",
    sourceFileHash: (input.meta?.["source_file_hash"] as string | undefined) ?? "(desconocido)",
    generatedAt: input.generatedAt,
    stagingRecords: input.stagingRecords,
    productionRecords: input.productionRecords,
    totals,
    byCenter,
    centerAlignment: input.centerAlignment,
    onlyInProduction,
    centersInProductionWithoutSheet: [...centersWithoutSheet.values()].sort(),
    conflictSamples,
    intraStagingDuplicates,
    scoreDistribution: scoreDistribution(scoreBuckets),
  };
}

function centerTotal(c: ReconciliationReportData["byCenter"][number]): number {
  return c.onlyInSource + c.matchIdentical + c.matchConflict + c.onlyInProduction + c.dupInSource;
}

function bumpScore(buckets: Map<string, number>, score: number | null): void {
  if (score == null) return;
  const lower = Math.min(0.9, Math.floor(score * 10) / 10);
  const label = `${lower.toFixed(1)}–${(lower + 0.099).toFixed(2)}`;
  buckets.set(label, (buckets.get(label) ?? 0) + 1);
}

function scoreDistribution(buckets: Map<string, number>): ReconciliationReportData["scoreDistribution"] {
  return [...buckets.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function toIsoOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function chunked<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
