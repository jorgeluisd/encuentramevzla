import { desc, eq } from "drizzle-orm";
import { admissions, auditLog, clinicalNotes, contacts, patients } from "@evzla/db";
import type { getDb } from "@evzla/db/client";
import type { EditablePatient, PatientEditor, PatientEditSave } from "@evzla/core";

type Db = ReturnType<typeof getDb>;

/**
 * Edición transaccional de un paciente propio (D11): actualiza `patients`, reescribe contacto
 * y nota del ingreso (esquema sensible) y deja rastro en `audit_log`. Todo o nada. Solo servidor.
 */
export class DrizzlePatientEditor implements PatientEditor {
  constructor(private readonly db: Db) {}

  async load(patientId: string): Promise<EditablePatient | null> {
    const [p] = await this.db
      .select({ id: patients.id })
      .from(patients)
      .where(eq(patients.id, patientId))
      .limit(1);
    if (!p) return null;

    const adms = await this.db
      .select({ id: admissions.id, hospitalId: admissions.hospitalId })
      .from(admissions)
      .where(eq(admissions.patientId, patientId))
      .orderBy(desc(admissions.createdAt));

    const admissionId = adms[0]?.id ?? null;
    let noteText: string | null = null;
    if (admissionId) {
      const [n] = await this.db
        .select({ note: clinicalNotes.note })
        .from(clinicalNotes)
        .where(eq(clinicalNotes.admissionId, admissionId))
        .limit(1);
      noteText = n?.note ?? null;
    }

    return {
      patientId,
      hospitalIds: new Set(adms.map((a) => a.hospitalId)),
      clinicalNotes: noteText,
      admissionId,
    };
  }

  async save({ patientId, actorId, changes }: PatientEditSave): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(patients)
        .set({
          normalizedName: changes.name.normalized,
          nameTokens: [...changes.name.tokens],
          age: changes.age,
          normalizedDocNumber:
            changes.document && changes.document.isValid ? changes.document.normalized : null,
          isMinor: changes.isMinor,
          status: changes.status,
        })
        .where(eq(patients.id, patientId));

      // Contacto: se reemplaza (evita acumular filas en cada edición).
      await tx.delete(contacts).where(eq(contacts.patientId, patientId));
      if (changes.phone || changes.address) {
        await tx.insert(contacts).values({ patientId, phone: changes.phone, address: changes.address });
      }

      // Nota clínica del ingreso: se reemplaza la del ingreso editado.
      if (changes.admissionId) {
        await tx.delete(clinicalNotes).where(eq(clinicalNotes.admissionId, changes.admissionId));
        if (changes.clinicalNotes) {
          await tx
            .insert(clinicalNotes)
            .values({ admissionId: changes.admissionId, note: changes.clinicalNotes });
        }
      }

      await tx.insert(auditLog).values({
        actorId,
        action: "patient_edited",
        entity: "patient",
        entityId: patientId,
        payload: { status: changes.status, isMinor: changes.isMinor },
      });
    });
  }
}
