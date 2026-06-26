import { ListReviewQueue } from "./list-review-queue";
import type {
  PatientBrief,
  ReviewFlag,
  ReviewQueueReader,
} from "../ports/review-queue-reader";

class FakeReader implements ReviewQueueReader {
  constructor(
    private readonly flags: ReviewFlag[],
    private readonly byDoc: Record<string, PatientBrief[]> = {},
    private readonly briefs: PatientBrief[] = [],
  ) {}
  async listOpenFlags(): Promise<ReviewFlag[]> {
    return this.flags;
  }
  async findByDocument(document: string): Promise<PatientBrief[]> {
    return this.byDoc[document] ?? [];
  }
  async loadBriefs(): Promise<PatientBrief[]> {
    return this.briefs;
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
    const cases = await new ListReviewQueue(reader).execute();
    expect(cases).toHaveLength(1);
    expect(cases[0]!.candidates.map((c) => c.id)).toEqual(["old"]);
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
    const cases = await new ListReviewQueue(reader).execute();
    expect(cases[0]!.candidates.map((c) => c.id)).toEqual(["sim"]);
  });
});
