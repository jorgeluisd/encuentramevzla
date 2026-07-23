import { nameSimilarity } from "../../../patient-registry/domain/services/patient-matching";
import { PersonName } from "../../../patient-registry/domain/value-objects/person-name";
import { cedulaMatchKey } from "../../domain/services/cedula-cell";
import {
  categorize,
  type ProductionCandidate,
  type ReconciliationIdentity,
} from "../../domain/services/reconciliation-category";
import type {
  MatchInput,
  ProductionCandidateRow,
  ProductionReadModel,
  ReconciliationStore,
  StagingRecordRow,
} from "../ports/reconciliation-store";

const DUP_NAME = 0.92; // duplicado intra-staging por nombre (mismo umbral que IDENTICAL)

export interface ReconcileSummary {
  runId: string;
  stagingRecords: number;
  onlyInSource: number;
  matchIdentical: number;
  matchConflict: number;
  onlyInProduction: number;
  dupInSource: number;
  needsReview: number;
}

export interface ReconcileInput {
  runId: string;
}

export interface ReconcileDependencies {
  store: ReconciliationStore;
  production: ProductionReadModel;
  newId: () => string;
}

export class ReconcileAgainstProduction {
  constructor(private readonly deps: ReconcileDependencies) {}

  async execute(input: ReconcileInput): Promise<ReconcileSummary> {
    const { store, production, newId } = this.deps;
    const staging = await store.loadStagingForRun(input.runId);

    const matches: MatchInput[] = [];
    const matchedProductionIds = new Set<string>();
    const summary: ReconcileSummary = {
      runId: input.runId,
      stagingRecords: staging.length,
      onlyInSource: 0,
      matchIdentical: 0,
      matchConflict: 0,
      onlyInProduction: 0,
      dupInSource: 0,
      needsReview: 0,
    };

    // Bloqueo por centro (clave opaca provista por el adapter).
    const byCenter = groupBy(staging, (r) => r.centerCanonical);
    const candidateCache = new Map<string, ProductionCandidate[]>();

    for (const [center, rows] of byCenter) {
      const candidates = await loadCandidates(production, candidateCache, center);
      // Sub-bloqueo por primer carácter del apellido normalizado (acota el producto cartesiano).
      const candidatesByInitial = groupBy(candidates, (c) => initial(c.name.normalized));
      const stagingByInitial = groupBy(rows, (r) => initial(r.normalizedName));

      for (const row of rows) {
        const source = toIdentity(row);
        const block = candidatesByInitial.get(initial(row.normalizedName)) ?? [];
        const result = categorize(source, block);

        const needsReview = result.needsReview;
        matches.push({
          id: newId(),
          runId: input.runId,
          stagingRecordId: row.id,
          productionRecordId: result.productionRecordId,
          relatedStagingRecordId: null,
          category: result.category,
          similarityScore: result.score,
          conflictingFields: result.conflictingFields,
          resolutionStatus: needsReview ? "needs_review" : "unreviewed",
        });
        if (result.productionRecordId) matchedProductionIds.add(result.productionRecordId);
        if (needsReview) summary.needsReview++;
        if (result.category === "ONLY_IN_SOURCE") summary.onlyInSource++;
        else if (result.category === "MATCH_IDENTICAL") summary.matchIdentical++;
        else summary.matchConflict++;
      }

      // Duplicados DENTRO del staging (el consolidado los trae): un marcador por registro
      // "sobrante" (contra el PRIMER registro anterior que lo duplica), no por par. Sub-bloque
      // por inicial de apellido.
      for (const [, sub] of stagingByInitial) {
        for (let j = 1; j < sub.length; j++) {
          const b = sub[j]!;
          for (let i = 0; i < j; i++) {
            const dup = isIntraDuplicate(sub[i]!, b);
            if (dup == null) continue;
            matches.push({
              id: newId(),
              runId: input.runId,
              stagingRecordId: b.id,
              productionRecordId: null,
              relatedStagingRecordId: sub[i]!.id,
              category: "DUP_IN_SOURCE",
              similarityScore: dup,
              conflictingFields: null,
              resolutionStatus: "needs_review",
            });
            summary.dupInSource++;
            summary.needsReview++;
            break; // un solo marcador por registro sobrante
          }
        }
      }
    }

    // Sección crítica ONLY_IN_PRODUCTION: prod sin contraparte en el Excel.
    const production_ = await production.listAllProduction();
    for (const p of production_) {
      if (matchedProductionIds.has(p.id)) continue;
      matches.push({
        id: newId(),
        runId: input.runId,
        stagingRecordId: null,
        productionRecordId: p.id,
        relatedStagingRecordId: null,
        category: "ONLY_IN_PRODUCTION",
        similarityScore: null,
        conflictingFields: null,
        resolutionStatus: "unreviewed",
      });
      summary.onlyInProduction++;
    }

    await store.saveMatches(matches);
    await store.markStatus(input.runId, "completed");
    return summary;
  }
}

// Devuelve el score si a y b son la misma persona dentro del staging; null si no.
function isIntraDuplicate(a: StagingRecordRow, b: StagingRecordRow): number | null {
  const ka = cedulaMatchKey(a.normalizedDoc);
  const kb = cedulaMatchKey(b.normalizedDoc);
  if (ka && kb && ka === kb) return 1;
  const score = nameSimilarity(PersonName.fromRaw(a.normalizedName), PersonName.fromRaw(b.normalizedName));
  return score >= DUP_NAME ? Math.round(score * 1000) / 1000 : null;
}

async function loadCandidates(
  production: ProductionReadModel,
  cache: Map<string, ProductionCandidate[]>,
  center: string,
): Promise<ProductionCandidate[]> {
  const cached = cache.get(center);
  if (cached) return cached;
  const rows = await production.loadCenterCandidates(center);
  const mapped = rows.map(toCandidate);
  cache.set(center, mapped);
  return mapped;
}

function toIdentity(row: StagingRecordRow): ReconciliationIdentity {
  return {
    name: PersonName.fromRaw(row.normalizedName),
    doc: row.normalizedDoc,
    age: row.age,
    sex: row.sex,
    center: row.centerCanonical,
  };
}

function toCandidate(row: ProductionCandidateRow): ProductionCandidate {
  return {
    id: row.id,
    name: PersonName.fromRaw(row.normalizedName),
    doc: row.normalizedDoc,
    age: row.age,
    sex: row.sex,
    center: row.centerCanonical,
  };
}

function initial(normalized: string): string {
  return normalized.charAt(0) || "?";
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}
