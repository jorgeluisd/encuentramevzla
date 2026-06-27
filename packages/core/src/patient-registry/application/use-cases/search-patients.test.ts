import type {
  MediatedSearchResult,
  PatientSearchGateway,
} from "../ports/patient-search-gateway";
import { SearchPatients } from "./search-patients";

class FakeGateway implements PatientSearchGateway {
  calls: { term: string; clientId?: string }[] = [];
  constructor(private readonly result: MediatedSearchResult) {}
  async search(term: string, clientId?: string): Promise<MediatedSearchResult> {
    this.calls.push({ term, clientId });
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
      matches: [
        {
          hospitalName: "Hospital X",
          infoDeskPhone: null,
          patientName: "carlos ruiz",
          confidence: 1,
        },
      ],
    });
    const result = await new SearchPatients(gateway).execute("  carlos  ");
    expect(gateway.calls).toEqual([{ term: "carlos", clientId: undefined }]);
    expect(result.kind).toBe("matches");
  });

  it("propagates the clientId to the gateway (para el rate-limit por IP)", async () => {
    const gateway = new FakeGateway({ kind: "no-results" });
    await new SearchPatients(gateway).execute("carlos ruiz", "ip-hash-123");
    expect(gateway.calls).toEqual([{ term: "carlos ruiz", clientId: "ip-hash-123" }]);
  });

  it("passes through the rate-limited result from the gateway", async () => {
    const gateway = new FakeGateway({ kind: "rate-limited" });
    const result = await new SearchPatients(gateway).execute("carlos ruiz", "ip-hash-123");
    expect(result).toEqual({ kind: "rate-limited" });
  });
});
