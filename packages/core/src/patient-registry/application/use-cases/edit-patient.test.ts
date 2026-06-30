import type {
  EditablePatient,
  PatientEditor,
  PatientEditSave,
} from "../ports/patient-editor";
import {
  CrossHospitalEditError,
  EditPatient,
  InvalidPatientError,
  PatientNotFoundError,
} from "./edit-patient";

class FakeEditor implements PatientEditor {
  saved: PatientEditSave | null = null;
  constructor(private readonly existing: EditablePatient | null) {}
  async load(patientId: string): Promise<EditablePatient | null> {
    return this.existing && this.existing.patientId === patientId ? this.existing : null;
  }
  async save(input: PatientEditSave): Promise<void> {
    this.saved = input;
  }
}

const editable = (over: Partial<EditablePatient> = {}): EditablePatient => ({
  patientId: "pt-1",
  hospitalIds: new Set(["ho-1"]),
  clinicalNotes: null,
  admissionId: "ad-1",
  ...over,
});

const fields = (over: Partial<Parameters<EditPatient["execute"]>[0]["fields"]> = {}) => ({
  fullName: "Carlos Mendoza",
  age: 40,
  documentNumber: "24.140.952",
  phone: null,
  address: null,
  clinicalNotes: null,
  status: "admitted" as const,
  deceased: false,
  ...over,
});

describe("EditPatient", () => {
  it("recalcula value objects (nombre normalizado, menor por marcador, cédula)", async () => {
    const editor = new FakeEditor(editable());
    await new EditPatient(editor).execute({
      actor: { role: "uploader", hospitalId: "ho-1" },
      actorId: "u1",
      patientId: "pt-1",
      fields: fields({ fullName: "Adrian Diaz Menor", documentNumber: "30.111.222", age: null }),
    });
    const saved = editor.saved!;
    expect(saved.changes.name.normalized).toBe("adrian diaz"); // sin 'menor' en el nombre
    expect(saved.changes.isMinor).toBe(true); // flaggedMinor
    expect(saved.changes.document!.normalized).toBe("30111222");
    expect(saved.actorId).toBe("u1");
  });

  it("re-evalúa looksDeceased cuando cambia la nota → estado fallecido", async () => {
    const editor = new FakeEditor(editable());
    await new EditPatient(editor).execute({
      actor: { role: "uploader", hospitalId: "ho-1" },
      actorId: "u1",
      patientId: "pt-1",
      fields: fields({ clinicalNotes: "paciente falleció anoche", status: "admitted" }),
    });
    expect(editor.saved!.changes.status).toBe("deceased");
  });

  it("respeta el selector de estado explícito cuando no hay señal de fallecimiento", async () => {
    const editor = new FakeEditor(editable());
    await new EditPatient(editor).execute({
      actor: { role: "moderator", hospitalId: null },
      actorId: "u1",
      patientId: "pt-1",
      fields: fields({ status: "discharged" }),
    });
    expect(editor.saved!.changes.status).toBe("discharged");
  });

  it("el toggle ¿falleció? fuerza el estado fallecido", async () => {
    const editor = new FakeEditor(editable());
    await new EditPatient(editor).execute({
      actor: { role: "uploader", hospitalId: "ho-1" },
      actorId: "u1",
      patientId: "pt-1",
      fields: fields({ deceased: true, status: "admitted" }),
    });
    expect(editor.saved!.changes.status).toBe("deceased");
  });

  it("un miembro acotado NO edita un paciente de otro hospital", async () => {
    const editor = new FakeEditor(editable({ hospitalIds: new Set(["ho-2"]) }));
    await expect(
      new EditPatient(editor).execute({
        actor: { role: "uploader", hospitalId: "ho-1" },
        actorId: "u1",
        patientId: "pt-1",
        fields: fields(),
      }),
    ).rejects.toBeInstanceOf(CrossHospitalEditError);
    expect(editor.saved).toBeNull();
  });

  it("un moderador global edita cualquier hospital", async () => {
    const editor = new FakeEditor(editable({ hospitalIds: new Set(["ho-9"]) }));
    await new EditPatient(editor).execute({
      actor: { role: "moderator", hospitalId: null },
      actorId: "u1",
      patientId: "pt-1",
      fields: fields(),
    });
    expect(editor.saved).not.toBeNull();
  });

  it("rechaza si no hay nombre ni cédula (D9)", async () => {
    const editor = new FakeEditor(editable());
    await expect(
      new EditPatient(editor).execute({
        actor: { role: "uploader", hospitalId: "ho-1" },
        actorId: "u1",
        patientId: "pt-1",
        fields: fields({ fullName: "   ", documentNumber: null }),
      }),
    ).rejects.toBeInstanceOf(InvalidPatientError);
  });

  it("lanza si el paciente no existe", async () => {
    const editor = new FakeEditor(null);
    await expect(
      new EditPatient(editor).execute({
        actor: { role: "moderator", hospitalId: null },
        actorId: "u1",
        patientId: "pt-1",
        fields: fields(),
      }),
    ).rejects.toBeInstanceOf(PatientNotFoundError);
  });
});
