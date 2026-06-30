import type {
  ExportRow,
  HospitalPatientExportReader,
} from "../ports/hospital-patient-export-reader";
import {
  CrossHospitalExportError,
  ExportHospitalPatients,
} from "./export-hospital-patients";

const exportRow = (over: Partial<ExportRow>): ExportRow => ({
  hospitalName: "Hospital X",
  fullName: "Ana Rojas",
  age: 30,
  documentNumber: "12.345.678",
  status: "admitted",
  isMinor: false,
  phone: null,
  address: null,
  clinicalNotes: null,
  ...over,
});

// Fake que SOLO devuelve filas del hospital pedido (simula el scoping del adapter).
class FakeExportReader implements HospitalPatientExportReader {
  calledWith: string[] = [];
  constructor(private readonly byHospital: Record<string, ExportRow[]>) {}
  async loadForHospital(hospitalId: string): Promise<ExportRow[]> {
    this.calledWith.push(hospitalId);
    return this.byHospital[hospitalId] ?? [];
  }
}

describe("ExportHospitalPatients", () => {
  it("devuelve las filas canónicas del hospital pedido", async () => {
    const reader = new FakeExportReader({
      "ho-1": [exportRow({ fullName: "Ana Rojas" }), exportRow({ fullName: "Beto Paz" })],
    });
    const rows = await new ExportHospitalPatients(reader).execute({
      actor: { role: "moderator", hospitalId: null },
      hospitalId: "ho-1",
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.fullName)).toEqual(["Ana Rojas", "Beto Paz"]);
    expect(reader.calledWith).toEqual(["ho-1"]);
  });

  it("un miembro acotado puede exportar SU hospital", async () => {
    const reader = new FakeExportReader({ "ho-1": [exportRow({})] });
    const rows = await new ExportHospitalPatients(reader).execute({
      actor: { role: "uploader", hospitalId: "ho-1" },
      hospitalId: "ho-1",
    });
    expect(rows).toHaveLength(1);
    expect(reader.calledWith).toEqual(["ho-1"]);
  });

  it("un miembro acotado NO puede exportar otro hospital (no fuga; ni siquiera consulta)", async () => {
    const reader = new FakeExportReader({ "ho-2": [exportRow({})] });
    const useCase = new ExportHospitalPatients(reader);
    await expect(
      useCase.execute({ actor: { role: "uploader", hospitalId: "ho-1" }, hospitalId: "ho-2" }),
    ).rejects.toBeInstanceOf(CrossHospitalExportError);
    // No se debe haber tocado el reader del otro hospital.
    expect(reader.calledWith).toEqual([]);
  });

  it("un miembro global (hospitalId null) puede exportar cualquier hospital", async () => {
    const reader = new FakeExportReader({ "ho-9": [exportRow({ hospitalName: "Hospital 9" })] });
    const rows = await new ExportHospitalPatients(reader).execute({
      actor: { role: "moderator", hospitalId: null },
      hospitalId: "ho-9",
    });
    expect(rows[0]!.hospitalName).toBe("Hospital 9");
    expect(reader.calledWith).toEqual(["ho-9"]);
  });
});
