import type {
  MediatedSearchResult,
  PatientSearchGateway,
} from "../ports/patient-search-gateway";
import { SearchPatients } from "./search-patients";

class FakeGateway implements PatientSearchGateway {
  calls: string[] = [];
  constructor(private readonly result: MediatedSearchResult) {}
  async search(term: string): Promise<MediatedSearchResult> {
    this.calls.push(term);
    return this.result;
  }
}

describe("SearchPatients", () => {
  it("rejects short terms without hitting the gateway", async () => {
    const gateway = new FakeGateway({ kind: "no-results" });
    const result = await new SearchPatients(gateway).execute("ab");
    expect(result).toEqual({ kind: "invalid-term" });
    expect(gateway.calls).toHaveLength(0);
  });

  it("trims and delegates valid terms to the gateway", async () => {
    const gateway = new FakeGateway({
      kind: "matches",
      matches: [{ hospitalName: "Hospital X", infoDeskPhone: null, confidence: 1 }],
    });
    const result = await new SearchPatients(gateway).execute("  carlos  ");
    expect(gateway.calls).toEqual(["carlos"]);
    expect(result.kind).toBe("matches");
  });
});
