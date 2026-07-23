// CLI de reconciliación (ADR-0008). Composition root: cablea los adapters (SheetJS + Postgres)
// con los casos de uso puros de @evzla/core. Se ejecuta con tsx.
//
// Uso:
//   pnpm --filter @evzla/db reconcile ingest   --file <ruta.xlsx> [--force]
//   pnpm --filter @evzla/db reconcile reconcile --run-id <uuid>
//   pnpm --filter @evzla/db reconcile report    --run-id <uuid>
//   pnpm --filter @evzla/db reconcile all        --file <ruta.xlsx> [--force]
//
// Sobre PROD, toda escritura exige el flag --i-have-a-verified-dump (ver RUNBOOK.md).
import {
  ApplyReconciliation,
  IngestConsolidatedSource,
  IngestPatientList,
  ReconcileAgainstProduction,
  renderReconciliationReport,
  type ParsedPatientList,
} from "@evzla/core";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { getDb } from "../../src/client";
import { DrizzleIngestionUnitOfWork } from "../../src/patient-registry/drizzle-repositories";
import { ENRICH_APPLY_SQL, ENRICH_PREVIEW_SQL } from "../../src/reconciliation/reconciliation-enrich-sql";
import { PostgresReconciliationImportSource } from "../../src/reconciliation/postgres-reconciliation-import-source";
import { PostgresReconciliationStore } from "../../src/reconciliation/postgres-reconciliation-store";
import { SheetjsConsolidatedSourceReader } from "../../src/reconciliation/sheetjs-consolidated-source-reader";

// Parser stub: ApplyReconciliation llama ingestParsed (no parse); nunca se usa.
const NO_PARSER = {
  parse(): ParsedPatientList {
    throw new Error("El import de reconciliación no parsea bytes (usa ingestParsed).");
  },
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const MIGRATION = join(ROOT, "supabase/migrations/0019_reconciliation_schema.sql");
const REPORTS_DIR = join(ROOT, "docs/reports");

interface Flags {
  cmd: string;
  file: string | null;
  runId: string | null;
  centerMap: string | null;
  actor: string | null;
  apply: boolean;
  force: boolean;
  hasDump: boolean;
}

function parseFlags(argv: string[]): Flags {
  const rest = argv.slice(2);
  const cmd = rest[0] ?? "";
  const get = (name: string): string | null => {
    const i = rest.indexOf(name);
    return i >= 0 && rest[i + 1] ? (rest[i + 1] as string) : null;
  };
  return {
    cmd,
    file: get("--file"),
    runId: get("--run-id"),
    centerMap: get("--center-map"),
    actor: get("--actor"),
    apply: rest.includes("--apply"),
    force: rest.includes("--force"),
    hasDump: rest.includes("--i-have-a-verified-dump"),
  };
}

// Override manual pestaña → hospital de prod (JSON). Corrige alineación sin tocar prod.
function loadCenterMap(path: string | null): Record<string, string> {
  if (!path) return {};
  const abs = resolve(path);
  if (!existsSync(abs)) {
    console.error(`⛔ No existe el --center-map: ${abs}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(abs, "utf8")) as Record<string, string>;
}

function connectionFromEnv(): { url: string; isLocal: boolean } {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("⛔ Falta DATABASE_URL en el entorno.");
    process.exit(1);
  }
  const isLocal = url.includes("127.0.0.1") || url.includes("localhost");
  return { url, isLocal };
}

// Gate obligatorio: sobre PROD, no se escribe sin un pg_dump verificado (restricción dura, ADR-0008).
function requireVerifiedDump(isLocal: boolean, hasDump: boolean): void {
  if (isLocal || hasDump) return;
  console.error(
    [
      "",
      "⛔ ESCRITURA SOBRE PRODUCCIÓN BLOQUEADA.",
      "   El pipeline solo crea el esquema aislado `reconciliation` (reversible con",
      "   DROP SCHEMA reconciliation CASCADE), pero el runbook exige un pg_dump VERIFICADO antes.",
      "",
      "   1) Respaldá:",
      '      pg_dump "$DATABASE_URL" -Fc -f backup_prod_$(date +%Y%m%d_%H%M).dump',
      "   2) Verificá el respaldo restaurándolo en una base local temporal.",
      "   3) Reintentá agregando el flag:  --i-have-a-verified-dump",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

async function applyMigration(sql: postgres.Sql): Promise<void> {
  const ddl = readFileSync(MIGRATION, "utf8");
  await sql.unsafe(ddl); // idempotente (CREATE ... IF NOT EXISTS)
}

function loadFile(path: string | null): { bytes: Uint8Array; name: string; hash: string } {
  if (!path) {
    console.error("⛔ Falta --file <ruta.xlsx>.");
    process.exit(1);
  }
  const abs = resolve(path);
  if (!existsSync(abs)) {
    console.error(`⛔ No existe el archivo: ${abs}`);
    process.exit(1);
  }
  const buffer = readFileSync(abs);
  const hash = createHash("sha256").update(buffer).digest("hex");
  return { bytes: new Uint8Array(buffer), name: basename(abs), hash };
}

function requireRunId(runId: string | null): string {
  if (!runId) {
    console.error("⛔ Falta --run-id <uuid>.");
    process.exit(1);
  }
  return runId;
}

async function runIngest(store: PostgresReconciliationStore, flags: Flags): Promise<string> {
  const { bytes, name, hash } = loadFile(flags.file);
  const runId = flags.runId ?? randomUUID();
  const ingest = new IngestConsolidatedSource({
    reader: new SheetjsConsolidatedSourceReader(),
    store,
    newId: randomUUID,
  });
  const summary = await ingest.execute({
    fileBytes: bytes,
    sourceFileName: name,
    sourceFileHash: hash,
    runId,
    force: flags.force,
  });
  console.log("\n== INGESTA ==");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nrun_id = ${runId}`);
  return runId;
}

async function runReconcile(store: PostgresReconciliationStore, runId: string): Promise<void> {
  const summary = await new ReconcileAgainstProduction({
    store,
    production: store,
    newId: randomUUID,
  }).execute({ runId });
  console.log("\n== RECONCILIACIÓN ==");
  console.log(JSON.stringify(summary, null, 2));
}

async function runReport(store: PostgresReconciliationStore, runId: string): Promise<void> {
  const data = await store.buildReportData(runId);
  const md = renderReconciliationReport(data);
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
  const out = join(REPORTS_DIR, `reconciliation-${runId}-${data.generatedAt}.md`);
  writeFileSync(out, md, "utf8");
  console.log("\n== REPORTE ==");
  console.log(`Escrito: ${out}`);
  console.log(
    `Totales → soloExcel=${data.totals.onlyInSource} idénticos=${data.totals.matchIdentical} ` +
      `conflicto=${data.totals.matchConflict} soloProd=${data.totals.onlyInProduction} ` +
      `dup=${data.totals.dupInSource} revisión=${data.totals.needsReview}`,
  );
}

// F1 — Importar ONLY_IN_SOURCE a prod vía IngestPatientList (dedup real). Dry-run por defecto.
async function runApplyImport(sql: postgres.Sql, flags: Flags): Promise<void> {
  const runId = requireRunId(flags.runId);
  const source = new PostgresReconciliationImportSource(sql);
  const rows = await source.loadImportable(runId);

  const minors = rows.filter((r) => r.isMinor === true).length;
  const withName = rows.filter((r) => r.fullName).length;
  const withDoc = rows.filter((r) => (r.documentNumber ?? "").replace(/\D/g, "").length >= 6).length;
  const centers = new Set(rows.map((r) => r.hospitalName ?? "")).size;
  console.log("\n== IMPORT F1 (ONLY_IN_SOURCE) ==");
  console.log(
    `importables=${rows.length} conNombre=${withName} conCédula=${withDoc} menores=${minors} centros=${centers}`,
  );

  if (!flags.apply) {
    console.log("DRY-RUN: nada escrito. Repetí con --apply (requiere --i-have-a-verified-dump en prod).");
    return;
  }

  const [meta] = await sql.unsafe(
    `SELECT source_file_name, source_file_hash FROM reconciliation.reconciliation_run WHERE run_id = $1`,
    [runId],
  );
  const [batch] = await sql.unsafe(
    `INSERT INTO public.ingest_batch (id, kind, source_file_name, source_file_hash, run_id, actor_id, notes)
     VALUES (gen_random_uuid(), 'reconciliation_import', $1, $2, $3, $4, $5) RETURNING id`,
    [
      (meta?.["source_file_name"] as string) ?? null,
      (meta?.["source_file_hash"] as string) ?? null,
      runId,
      flags.actor,
      `import ONLY_IN_SOURCE de la corrida ${runId}`,
    ],
  );
  const batchId = batch!["id"] as string;

  const ingest = new IngestPatientList({
    parser: NO_PARSER,
    uow: new DrizzleIngestionUnitOfWork(getDb(), batchId),
    newId: randomUUID,
  });
  const summary = await new ApplyReconciliation({ source, ingest }).execute({
    runId,
    actorId: flags.actor,
  });
  console.log(`\nAPLICADO. ingest_batch = ${batchId}`);
  console.log(JSON.stringify(summary, null, 2));
}

// F2 — Enriquecer (fill-only) los MATCH_IDENTICAL desde el Excel. Dry-run por defecto.
async function runEnrich(sql: postgres.Sql, flags: Flags): Promise<void> {
  const runId = requireRunId(flags.runId);
  const [prev] = (await sql.unsafe(ENRICH_PREVIEW_SQL, [runId])) as [
    { fill_doc: number; fill_age: number; elevate_minor: number; affected: number },
  ];
  console.log("\n== ENRICH F2 (MATCH_IDENTICAL, fill-only) ==");
  console.log(
    `fillCédula=${prev.fill_doc} fillEdad=${prev.fill_age} elevarMenor=${prev.elevate_minor} pacientesAfectados=${prev.affected}`,
  );

  if (!flags.apply) {
    console.log("DRY-RUN: nada escrito. Repetí con --apply (requiere --i-have-a-verified-dump en prod).");
    return;
  }

  const [meta] = await sql.unsafe(
    `SELECT source_file_name, source_file_hash FROM reconciliation.reconciliation_run WHERE run_id = $1`,
    [runId],
  );
  const [batch] = await sql.unsafe(
    `INSERT INTO public.ingest_batch (id, kind, source_file_name, source_file_hash, run_id, actor_id, notes)
     VALUES (gen_random_uuid(), 'reconciliation_enrich', $1, $2, $3, $4, $5) RETURNING id`,
    [
      (meta?.["source_file_name"] as string) ?? null,
      (meta?.["source_file_hash"] as string) ?? null,
      runId,
      flags.actor,
      `enrich MATCH_IDENTICAL (fill-only) de la corrida ${runId}`,
    ],
  );
  const batchId = batch!["id"] as string;
  await sql.unsafe(ENRICH_APPLY_SQL, [runId, batchId]);
  const [enriched] = (await sql.unsafe(
    `SELECT count(*)::int AS n FROM public.patient_provenance WHERE ingest_batch_id = $1 AND source_kind = 'enrich'`,
    [batchId],
  )) as [{ n: number }];
  console.log(`\nAPLICADO. ingest_batch = ${batchId} · pacientes enriquecidos = ${enriched.n}`);
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv);
  const { url, isLocal } = connectionFromEnv();

  console.log(`\n=== Reconciliación de fuente consolidada (ADR-0008) ===`);
  console.log(`DESTINO: ${isLocal ? "LOCAL" : "⚠️  REMOTO/PROD"}  ·  comando: ${flags.cmd || "(ninguno)"}`);

  const sql = postgres(url, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {}, // silenciar NOTICE (extensiones ya existentes, etc.)
  });
  const store = new PostgresReconciliationStore(sql, loadCenterMap(flags.centerMap));

  try {
    switch (flags.cmd) {
      case "ingest": {
        requireVerifiedDump(isLocal, flags.hasDump);
        await applyMigration(sql);
        await runIngest(store, flags);
        break;
      }
      case "reconcile": {
        requireVerifiedDump(isLocal, flags.hasDump);
        await applyMigration(sql);
        await runReconcile(store, requireRunId(flags.runId));
        break;
      }
      case "report": {
        await runReport(store, requireRunId(flags.runId));
        break;
      }
      case "apply-import": {
        if (flags.apply) requireVerifiedDump(isLocal, flags.hasDump);
        await runApplyImport(sql, flags);
        break;
      }
      case "enrich": {
        if (flags.apply) requireVerifiedDump(isLocal, flags.hasDump);
        await runEnrich(sql, flags);
        break;
      }
      case "all": {
        requireVerifiedDump(isLocal, flags.hasDump);
        await applyMigration(sql);
        const runId = await runIngest(store, flags);
        await runReconcile(store, runId);
        await runReport(store, runId);
        break;
      }
      default:
        console.error(
          "⛔ Comando desconocido. Usá: ingest | reconcile | report | all (ver RUNBOOK.md).",
        );
        process.exitCode = 1;
    }
  } catch (error) {
    console.error("\n💥", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main();
