import { isServiceStatus, isActiveStatus } from "./service-status";

describe("ServiceStatus", () => {
  it("recognizes the known statuses", () => {
    for (const s of ["pending", "approved", "rejected", "removed", "expired"]) {
      expect(isServiceStatus(s)).toBe(true);
    }
  });

  it("rejects unknown statuses", () => {
    expect(isServiceStatus("draft")).toBe(false);
  });

  it("counts pending and approved as active (toward the per-email limit)", () => {
    expect(isActiveStatus("pending")).toBe(true);
    expect(isActiveStatus("approved")).toBe(true);
    expect(isActiveStatus("rejected")).toBe(false);
    expect(isActiveStatus("removed")).toBe(false);
    expect(isActiveStatus("expired")).toBe(false);
  });
});
