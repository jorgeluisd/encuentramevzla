import {
  mostSimilarByName,
  type MatchCandidate,
} from "../../domain/services/patient-matching";
import { PersonName } from "../../domain/value-objects/person-name";
import type {
  PatientBrief,
  ReviewFlag,
  ReviewQueueReader,
} from "../ports/review-queue-reader";

// Caso de la cola listo para mostrar: el registro dudoso + sus candidatos.
export interface ReviewCase {
  patientId: string;
  name: string;
  document: string | null; // cédula del registro nuevo (para comparar con la del candidato)
  reason: ReviewFlag["reason"];
  candidates: PatientBrief[];
  hospitals: string[]; // hospitales del registro dudoso (source)
}

// Página de la cola: los casos de la ventana + el total (para calcular cuántas páginas hay).
export interface ReviewQueuePage {
  cases: ReviewCase[];
  total: number;
}

const DEFAULT_PAGE_SIZE = 20;

/**
 * Arma la cola de revisión abierta. Para conflictos de cédula trae los registros que
 * comparten la cédula; para zona gris recalcula el más parecido por nombre.
 */
export class ListReviewQueue {
  constructor(private readonly reader: ReviewQueueReader) {}

  // `scopeHospitalId` acota la cola al hospital del actor (hospital_admin); `null`/ausente = todos
  // (moderador global). El scoping y la paginación se resuelven en SQL: solo se trae —y se calcula
  // el match por nombre de— la ventana pedida (evita recorrer toda la cola en cada carga).
  async execute(input?: {
    scopeHospitalId?: string | null;
    page?: number;
    pageSize?: number;
  }): Promise<ReviewQueuePage> {
    const scopeHospitalId = input?.scopeHospitalId ?? null;
    const pageSize = input?.pageSize ?? DEFAULT_PAGE_SIZE;
    const page = Math.max(1, Math.trunc(input?.page ?? 1));
    const { flags, total } = await this.reader.listOpenFlags({
      scopeHospitalId,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    const cases: ReviewCase[] = [];
    let briefs: PatientBrief[] | null = null; // carga perezosa para zona gris

    for (const flag of flags) {
      let candidates: PatientBrief[] = [];

      if (flag.reason === "document_conflict" && flag.document) {
        candidates = (await this.reader.findByDocument(flag.document)).filter(
          (b) => b.id !== flag.patientId,
        );
      } else if (flag.reason === "pending_review") {
        briefs ??= await this.reader.loadBriefs();
        const others = briefs.filter((b) => b.id !== flag.patientId);
        const forMatch: MatchCandidate[] = others.map((b) => ({
          id: b.id,
          name: PersonName.fromRaw(b.name),
          document: null,
        }));
        const best = mostSimilarByName(PersonName.fromRaw(flag.name), forMatch);
        const brief = best && others.find((b) => b.id === best.candidate.id);
        if (brief) candidates = [brief];
      }

      cases.push({
        patientId: flag.patientId,
        name: flag.name,
        document: flag.document,
        reason: flag.reason,
        candidates,
        hospitals: [],
      });
    }

    // Enriquecer con hospitales (una sola lectura) para el detalle de "Más info".
    const ids = cases.flatMap((c) => [c.patientId, ...c.candidates.map((b) => b.id)]);
    if (ids.length > 0) {
      const byPatient = await this.reader.hospitalsOf(ids);
      for (const c of cases) {
        c.hospitals = byPatient.get(c.patientId) ?? [];
        for (const cand of c.candidates) cand.hospitals = byPatient.get(cand.id) ?? [];
      }
    }

    return { cases, total };
  }
}
