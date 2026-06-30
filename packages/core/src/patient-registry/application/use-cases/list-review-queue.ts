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
  reason: ReviewFlag["reason"];
  candidates: PatientBrief[];
  hospitals: string[]; // hospitales del registro dudoso (source)
}

/**
 * Arma la cola de revisión abierta. Para conflictos de cédula trae los registros que
 * comparten la cédula; para zona gris recalcula el más parecido por nombre.
 */
export class ListReviewQueue {
  constructor(private readonly reader: ReviewQueueReader) {}

  // `scopeHospitalId` acota la cola al hospital del actor (hospital_admin); `null`/ausente = todos
  // (moderador global). El caso se conserva si su registro dudoso tiene ingreso en ese hospital.
  async execute(input?: { scopeHospitalId?: string | null }): Promise<ReviewCase[]> {
    const scopeHospitalId = input?.scopeHospitalId ?? null;
    const flags = await this.reader.listOpenFlags();
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
        reason: flag.reason,
        candidates,
        hospitals: [],
      });
    }

    // Scoping por hospital (P5): conserva solo los casos cuyo registro dudoso tiene ingreso
    // en el hospital del actor. El global (scopeHospitalId null) no filtra.
    let scoped = cases;
    if (scopeHospitalId !== null && cases.length > 0) {
      const idsByPatient = await this.reader.hospitalIdsOf(cases.map((c) => c.patientId));
      scoped = cases.filter((c) =>
        (idsByPatient.get(c.patientId) ?? []).includes(scopeHospitalId),
      );
    }

    // Enriquecer con hospitales (una sola lectura) para el detalle de "Más info".
    const ids = scoped.flatMap((c) => [c.patientId, ...c.candidates.map((b) => b.id)]);
    if (ids.length > 0) {
      const byPatient = await this.reader.hospitalsOf(ids);
      for (const c of scoped) {
        c.hospitals = byPatient.get(c.patientId) ?? [];
        for (const cand of c.candidates) cand.hospitals = byPatient.get(cand.id) ?? [];
      }
    }

    return scoped;
  }
}
