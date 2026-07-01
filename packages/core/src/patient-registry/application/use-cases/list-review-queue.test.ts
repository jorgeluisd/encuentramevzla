import { ListReviewQueue } from "./list-review-queue";
import type {
  ListOpenFlagsInput,
  OpenFlagsPage,
  PatientBrief,
  ReviewFlag,
  ReviewQueueReader,
} from "../ports/review-queue-reader";

class FakeReader implements ReviewQueueReader {
  constructor(
    private readonly flags: ReviewFlag[],
    private readonly byDoc: Record<string, PatientBrief[]> = {},
    private readonly briefs: PatientBrief[] = [],
    private readonly hospitals: Record<string, string[]> = {},
    private readonly hospitalIds: Record<string, string[]> = {},
  ) {}
  // Réplica del scoping + paginación que hace el SQL real.
  async listOpenFlags({ scopeHospitalId, limit, offset }: ListOpenFlagsInput): Promise<OpenFlagsPage> {
    let fs = this.flags;
    if (scopeHospitalId != null) {
      fs = fs.filter((f) => (this.hospitalIds[f.patientId] ?? []).includes(scopeHospitalId));
    }
    return { flags: fs.slice(offset, offset + limit), total: fs.length };
  }
  async findByDocument(document: string): Promise<PatientBrief[]> {
    return this.byDoc[document] ?? [];
  }
  async loadBriefs(): Promise<PatientBrief[]> {
    return this.briefs;
  }
  async hospitalsOf(patientIds: readonly string[]): Promise<Map<string, string[]>> {
    return new Map(patientIds.map((id) => [id, this.hospitals[id] ?? []]));
  }
  async hospitalIdsOf(patientIds: readonly string[]): Promise<Map<string, string[]>> {
    return new Map(patientIds.map((id) => [id, this.hospitalIds[id] ?? []]));
  }
}

describe("ListReviewQueue", () => {
  it("brings the same-document candidates for a conflict (excluding itself)", async () => {
    const reader = new FakeReader(
      [{ patientId: "new", name: "gosling raymond", document: "29900166", reason: "document_conflict" }],
      {
        "29900166": [
          { id: "new", name: "gosling raymond", document: "29900166" },
          { id: "old", name: "gosling hairmon", document: "29900166" },
        ],
      },
    );
    const { cases } = await new ListReviewQueue(reader).execute();
    expect(cases).toHaveLength(1);
    expect(cases[0]!.candidates.map((c) => c.id)).toEqual(["old"]);
  });

  // 0020: la política conservadora manda a la cola los homónimos "mismo nombre" que antes
  // se fusionaban solos (ej. varios "Juan Perez"). Cada uno debe traer a otro como candidato.
  it("surfaces several same-name pending_review cases, each with a same-name candidate", async () => {
    const reader = new FakeReader(
      [
        { patientId: "jp2", name: "juan perez", document: null, reason: "pending_review" },
        { patientId: "jp3", name: "juan perez", document: null, reason: "pending_review" },
      ],
      {},
      [
        { id: "jp1", name: "juan perez", document: null },
        { id: "jp2", name: "juan perez", document: null },
        { id: "jp3", name: "juan perez", document: null },
      ],
    );
    const { cases } = await new ListReviewQueue(reader).execute();
    expect(cases).toHaveLength(2);
    for (const c of cases) {
      expect(c.reason).toBe("pending_review");
      expect(c.candidates).toHaveLength(1);
      expect(c.candidates[0]!.id).not.toBe(c.patientId); // no se propone a sí mismo
    }
  });

  it("recomputes the most similar candidate for a grey-zone case (excluding itself)", async () => {
    const reader = new FakeReader(
      [{ patientId: "g", name: "valeria contreras", document: null, reason: "pending_review" }],
      {},
      [
        { id: "g", name: "valeria contreras", document: null },
        { id: "sim", name: "valeria contrera", document: null },
        { id: "far", name: "carlos gomez", document: null },
      ],
    );
    const { cases } = await new ListReviewQueue(reader).execute();
    expect(cases[0]!.candidates.map((c) => c.id)).toEqual(["sim"]);
  });

  it("enriches the case and its candidates with their hospitals", async () => {
    const reader = new FakeReader(
      [{ patientId: "new", name: "gosling raymond", document: "29900166", reason: "document_conflict" }],
      {
        "29900166": [
          { id: "new", name: "gosling raymond", document: "29900166" },
          { id: "old", name: "gosling hairmon", document: "29900166" },
        ],
      },
      [],
      { new: ["Hospital X"], old: ["Hospital Y", "Hospital Z"] },
    );
    const { cases } = await new ListReviewQueue(reader).execute();
    expect(cases[0]!.hospitals).toEqual(["Hospital X"]);
    expect(cases[0]!.candidates[0]!.hospitals).toEqual(["Hospital Y", "Hospital Z"]);
  });

  it("acota la cola al hospital del actor (P5): conserva solo casos de su hospital", async () => {
    const reader = new FakeReader(
      [
        { patientId: "p-a", name: "ana rojas", document: "11111111", reason: "document_conflict" },
        { patientId: "p-b", name: "beto paz", document: "22222222", reason: "document_conflict" },
      ],
      {
        "11111111": [{ id: "p-a", name: "ana rojas", document: "11111111" }, { id: "x", name: "ana r", document: "11111111" }],
        "22222222": [{ id: "p-b", name: "beto paz", document: "22222222" }, { id: "y", name: "beto p", document: "22222222" }],
      },
      [],
      {},
      { "p-a": ["ho-1"], "p-b": ["ho-2"] }, // p-a en ho-1, p-b en ho-2
    );

    // Acotado a ho-1 → solo el caso p-a.
    const { cases: scoped } = await new ListReviewQueue(reader).execute({ scopeHospitalId: "ho-1" });
    expect(scoped.map((c) => c.patientId)).toEqual(["p-a"]);

    // Global (null) → ambos.
    const { cases: all } = await new ListReviewQueue(reader).execute({ scopeHospitalId: null });
    expect(all.map((c) => c.patientId).sort()).toEqual(["p-a", "p-b"]);
  });

  it("expone la cédula del registro nuevo en el caso (para comparar ambas cédulas)", async () => {
    const reader = new FakeReader(
      [{ patientId: "new", name: "aderson reginfo", document: "79956940", reason: "pending_review" }],
      {},
      [
        { id: "new", name: "aderson reginfo", document: "79956940" },
        { id: "old", name: "reginfo aderson", document: "7995694" },
      ],
    );
    const { cases } = await new ListReviewQueue(reader).execute();
    expect(cases[0]!.document).toBe("79956940");
    expect(cases[0]!.candidates[0]!.document).toBe("7995694");
  });

  it("pagina: devuelve solo la ventana pedida y el total de la cola", async () => {
    const flags: ReviewFlag[] = Array.from({ length: 25 }, (_, i) => ({
      patientId: `p${i}`,
      name: `juan perez ${i}`,
      document: `${1000000 + i}`,
      reason: "document_conflict" as const,
    }));
    const byDoc: Record<string, PatientBrief[]> = {};
    for (const f of flags) {
      byDoc[f.document!] = [
        { id: f.patientId, name: f.name, document: f.document },
        { id: `${f.patientId}-dup`, name: f.name, document: f.document },
      ];
    }
    const reader = new FakeReader(flags, byDoc);

    const p1 = await new ListReviewQueue(reader).execute({ page: 1, pageSize: 10 });
    expect(p1.total).toBe(25);
    expect(p1.cases).toHaveLength(10);
    expect(p1.cases[0]!.patientId).toBe("p0");

    const p3 = await new ListReviewQueue(reader).execute({ page: 3, pageSize: 10 });
    expect(p3.total).toBe(25);
    expect(p3.cases).toHaveLength(5); // última página parcial
    expect(p3.cases[0]!.patientId).toBe("p20");
  });
});
