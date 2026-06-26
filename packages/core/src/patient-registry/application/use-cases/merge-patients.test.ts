import { MergePatients } from "./merge-patients";
import type { PatientMerger } from "../ports/patient-merger";

class FakeMerger implements PatientMerger {
  calls: Array<{ targetId: string; sourceId: string; actorId: string | null }> = [];
  async merge(input: {
    targetId: string;
    sourceId: string;
    actorId: string | null;
  }): Promise<void> {
    this.calls.push(input);
  }
}

describe("MergePatients", () => {
  it("delegates a valid merge to the merger once", async () => {
    const merger = new FakeMerger();
    await new MergePatients(merger).execute({
      targetId: "t",
      sourceId: "s",
      actorId: "m1",
    });
    expect(merger.calls).toEqual([{ targetId: "t", sourceId: "s", actorId: "m1" }]);
  });

  it("refuses to merge a patient with itself", async () => {
    const merger = new FakeMerger();
    await expect(
      new MergePatients(merger).execute({
        targetId: "x",
        sourceId: "x",
        actorId: "m1",
      }),
    ).rejects.toThrow();
    expect(merger.calls).toHaveLength(0);
  });
});
