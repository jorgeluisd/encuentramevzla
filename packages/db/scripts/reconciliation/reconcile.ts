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
  IngestConsolidatedSource,
  ReconcileAgainstProduction,
  renderReconciliationReport,
} from "@evzla/core";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { PostgresReconciliationStore } from "../../src/reconciliation/postgres-reconciliation-store";
import { SheetjsConsolidatedSourceReader } from "../../src/reconciliation/sheetjs-consolidated-source-reader";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const MIGRATION = join(ROOT, "supabase/migrations/0019_reconciliation_schema.sql");
const REPORTS_DIR = join(ROOT, "docs/reports");

interface Flags {
  cmd: string;
  file: string | null;
  runId: string | null;
  centerMap: string | null;
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
