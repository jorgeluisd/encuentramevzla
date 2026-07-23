// Renderizado PURO del reporte de reconciliación a Markdown (español neutro/venezolano).
// Los datos los arma un adapter (SQL de agregación); aquí no hay I/O.

export interface CenterBreakdown {
  center: string; // nombre de centro (pestaña o canónico de prod)
  hasSheet: boolean; // el Excel trae una pestaña de este centro
  onlyInSource: number;
  matchIdentical: number;
  matchConflict: number;
  onlyInProduction: number;
  dupInSource: number;
}

export interface OnlyInProductionItem {
  center: string;
  patientName: string; // nombre normalizado (interno; el reporte NO se publica)
  createdAt: string | null; // única procedencia disponible en prod
}

export interface ConflictSample {
  center: string;
  stagingName: string;
  productionName: string;
  fields: Record<string, { source: unknown; production: unknown }>;
}

export interface DuplicateSample {
  center: string;
  nameA: string;
  nameB: string;
  score: number;
}

export interface ScoreBucket {
  label: string; // p.ej. "0.90–0.99"
  count: number;
}

// Cómo cada pestaña del Excel se resolvió a un hospital de prod (catálogo + alias + difuso).
// `sin match` ⇒ la pestaña es un centro que prod no tiene (o cuyo nombre no converge).
export interface CenterAlignment {
  sheet: string;
  resolvedHospital: string | null;
}

export interface ReconciliationReportData {
  runId: string;
  sourceFileName: string;
  sourceFileHash: string;
  generatedAt: string;
  stagingRecords: number;
  productionRecords: number;
  totals: {
    onlyInSource: number;
    matchIdentical: number;
    matchConflict: number;
    onlyInProduction: number;
    dupInSource: number;
    needsReview: number;
  };
  byCenter: CenterBreakdown[];
  centerAlignment: CenterAlignment[]; // pestaña → hospital de prod (auditable)
  onlyInProduction: OnlyInProductionItem[]; // listado COMPLETO
  centersInProductionWithoutSheet: string[]; // cobertura que el consolidado no tiene
  conflictSamples: ConflictSample[]; // hasta 20
  intraStagingDuplicates: DuplicateSample[];
  scoreDistribution: ScoreBucket[];
}

export function renderReconciliationReport(data: ReconciliationReportData): string {
  const t = data.totals;
  const lines: string[] = [];

  lines.push(`# Reporte de reconciliación — corrida ${data.runId}`);
  lines.push("");
  lines.push(`- **Archivo fuente:** \`${data.sourceFileName}\``);
  lines.push(`- **Hash (SHA-256):** \`${data.sourceFileHash}\``);
  lines.push(`- **Generado:** ${data.generatedAt}`);
  lines.push(`- **Registros en staging (Excel):** ${data.stagingRecords}`);
  lines.push(`- **Registros en producción:** ${data.productionRecords}`);
  lines.push("");
  lines.push("> Diagnóstico, no ejecución. Este reporte NO decide reemplazar ni reconciliar:");
  lines.push("> te da los números para decidirlo. Contiene nombres internos: no se publica.");
  lines.push("");

  lines.push("## 1. Totales por categoría");
  lines.push("");
  lines.push("| Categoría | Registros |");
  lines.push("|---|---:|");
  lines.push(`| ONLY_IN_SOURCE (solo en el Excel) | ${t.onlyInSource} |`);
  lines.push(`| MATCH_IDENTICAL (en ambos, sin conflicto) | ${t.matchIdentical} |`);
  lines.push(`| MATCH_CONFLICT (en ambos, con discrepancia) | ${t.matchConflict} |`);
  lines.push(`| **ONLY_IN_PRODUCTION (solo en prod — crítico)** | **${t.onlyInProduction}** |`);
  lines.push(`| DUP_IN_SOURCE (duplicados dentro del Excel) | ${t.dupInSource} |`);
  lines.push(`| — de los cuales requieren revisión humana | ${t.needsReview} |`);
  lines.push("");

  lines.push("## 2. Desglose por centro");
  lines.push("");
  lines.push("| Centro | ¿Pestaña? | Solo Excel | Idénticos | Conflicto | Solo Prod | Dup |");
  lines.push("|---|:---:|---:|---:|---:|---:|---:|");
  for (const c of data.byCenter) {
    lines.push(
      `| ${c.center} | ${c.hasSheet ? "sí" : "no"} | ${c.onlyInSource} | ${c.matchIdentical} | ` +
        `${c.matchConflict} | ${c.onlyInProduction} | ${c.dupInSource} |`,
    );
  }
  lines.push("");

  lines.push("## 2b. Alineación de centros (pestaña del Excel → hospital de prod)");
  lines.push("");
  lines.push(
    "Cómo se resolvió cada pestaña contra el catálogo de prod (exacto/alias/difuso, ADR-0005). " +
      "`sin match` = centro que prod no tiene (o cuyo nombre no converge; se puede agregar un alias).",
  );
  lines.push("");
  lines.push("| Pestaña | Hospital de prod |");
  lines.push("|---|---|");
  for (const a of data.centerAlignment) {
    lines.push(`| ${a.sheet} | ${a.resolvedHospital ?? "**sin match**"} |`);
  }
  lines.push("");

  lines.push("## 3. ONLY_IN_PRODUCTION — sección crítica");
  lines.push("");
  lines.push(
    "Registros presentes en producción **sin contraparte en el Excel**. Borrarlos con un " +
      "reemplazo ciego perdería pacientes reales. Procedencia = único dato disponible en prod " +
      "(no hay `source`/`ingested_by`; solo la fecha de creación).",
  );
  lines.push("");
  if (data.centersInProductionWithoutSheet.length > 0) {
    lines.push(
      "**Centros en producción que el consolidado NO cubre (sin pestaña):** " +
        data.centersInProductionWithoutSheet.map((c) => `\`${c}\``).join(", ") +
        ".",
    );
    lines.push("");
  }
  const onlyProdByCenter = groupOnlyInProduction(data.onlyInProduction);
  for (const group of onlyProdByCenter) {
    lines.push(`### ${group.center} — ${group.items.length} registro(s)`);
    lines.push("");
    lines.push("| Paciente | Fecha de carga (prod) |");
    lines.push("|---|---|");
    for (const item of group.items) {
      lines.push(`| ${item.patientName} | ${item.createdAt ?? "—"} |`);
    }
    lines.push("");
  }
  if (onlyProdByCenter.length === 0) {
    lines.push("_No hay registros solo en producción._");
    lines.push("");
  }

  lines.push("## 4. Muestra de conflictos (MATCH_CONFLICT)");
  lines.push("");
  if (data.conflictSamples.length === 0) {
    lines.push("_Sin conflictos._");
  } else {
    lines.push("| Centro | Excel | Producción | Campos en conflicto |");
    lines.push("|---|---|---|---|");
    for (const s of data.conflictSamples) {
      const fields = Object.entries(s.fields)
        .map(([k, v]) => `${k}: \`${fmt(v.source)}\` vs \`${fmt(v.production)}\``)
        .join("; ");
      lines.push(`| ${s.center} | ${s.stagingName} | ${s.productionName} | ${fields} |`);
    }
  }
  lines.push("");

  lines.push("## 5. Duplicados dentro del Excel (intra-staging)");
  lines.push("");
  if (data.intraStagingDuplicates.length === 0) {
    lines.push("_Sin duplicados intra-staging._");
  } else {
    lines.push("| Centro | Registro A | Registro B | Score |");
    lines.push("|---|---|---|---:|");
    for (const d of data.intraStagingDuplicates) {
      lines.push(`| ${d.center} | ${d.nameA} | ${d.nameB} | ${d.score.toFixed(3)} |`);
    }
  }
  lines.push("");

  lines.push("## 6. Distribución de similarity_score (calibración de umbrales)");
  lines.push("");
  lines.push("| Rango | Registros |");
  lines.push("|---|---:|");
  for (const bucket of data.scoreDistribution) {
    lines.push(`| ${bucket.label} | ${bucket.count} |`);
  }
  lines.push("");

  return lines.join("\n");
}

interface OnlyInProductionGroup {
  center: string;
  items: OnlyInProductionItem[];
}

// Agrupa por centro y ordena por volumen (desc), como pide la sección crítica.
function groupOnlyInProduction(items: readonly OnlyInProductionItem[]): OnlyInProductionGroup[] {
  const map = new Map<string, OnlyInProductionItem[]>();
  for (const item of items) {
    const list = map.get(item.center);
    if (list) list.push(item);
    else map.set(item.center, [item]);
  }
  return [...map.entries()]
    .map(([center, groupItems]) => ({ center, items: groupItems }))
    .sort((a, b) => b.items.length - a.items.length);
}

function fmt(value: unknown): string {
  if (value == null) return "∅";
  return String(value);
}
