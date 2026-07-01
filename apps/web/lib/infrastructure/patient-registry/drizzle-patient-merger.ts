import { eq } from "drizzle-orm";
import { admissions, auditLog, contacts, patients } from "@evzla/db";
import type { getDb } from "@evzla/db/client";
import {
  DocumentId,
  mergedFields,
  type MergeSide,
  type PatientMerger,
} from "@evzla/core";

type Db = ReturnType<typeof getDb>;

interface PatientRow {
  doc: string | null;
  isMinor: boolean;
  status: MergeSide["status"];
  age: number | null;
}

function toSide(p: PatientRow): MergeSide {
  const d = p.doc ? DocumentId.fromRaw(p.doc) : null;
  return {
    documentNormalized: d?.normalized ?? null,
    documentValid: d?.isValid ?? false,
    isMinor: p.isMinor,
    status: p.status,
    age: p.age,
  };
}

/**
 * Fusión transaccional (hard delete del duplicado). Re-apunta ingresos y datos
 * sensibles del source al target, reconcilia campos del target (regla pura del
 * dominio), borra el source y deja rastro en audit. Todo o nada. Solo servidor.
 */
export class DrizzlePatientMerger implements PatientMerger {
  constructor(private readonly db: Db) {}

  async merge({
    targetId,
    sourceId,
    actorId,
  }: {
    targetId: string;
    sourceId: string;
    actorId: string | null;
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      const cols = {
        doc: patients.normalizedDocNumber,
        isMinor: patients.isMinor,
        status: patients.status,
        age: patients.age,
      };
      const [target] = await tx
        .select(cols)
        .from(patients)
        .where(eq(patients.id, targetId))
        .limit(1);
      const [source] = await tx
        .select(cols)
        .from(patients)
        .where(eq(patients.id, sourceId))
        .limit(1);
      if (!target || !source) {
        throw new Error("Paciente no encontrado para la fusión.");
      }

      const changes = mergedFields(toSide(target), toSide(source));

      // Re-apuntar ingresos y contactos sensibles del duplicado al canónico.
      await tx
        .update(admissions)
        .set({ patientId: targetId })
        .where(eq(admissions.patientId, sourceId));
      await tx
        .update(contacts)
        .set({ patientId: targetId })
        .where(eq(contacts.patientId, sourceId));

      // Reconciliar campos del canónico (solo completar/elevar).
      const patch: Partial<typeof patients.$inferInsert> = {};
      if (changes.documentNormalized) patch.normalizedDocNumber = changes.documentNormalized;
      if (changes.isMinor) patch.isMinor = true;
      if (changes.status) patch.status = changes.status;
      if (changes.age != null) patch.age = changes.age;
      if (Object.keys(patch).length > 0) {
        await tx.update(patients).set(patch).where(eq(patients.id, targetId));
      }

      // Hard delete del duplicado y rastro de la fusión.
      await tx.delete(patients).where(eq(patients.id, sourceId));
      await tx.insert(auditLog).values({
        actorId,
        action: "patients_merged",
        entity: "patient",
        entityId: targetId,
        payload: { mergedFrom: sourceId },
      });
    });
  }
}
