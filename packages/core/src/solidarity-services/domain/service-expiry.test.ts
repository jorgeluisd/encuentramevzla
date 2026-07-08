import { SERVICE_EXPIRY_DAYS, computeExpiry } from "./service-expiry";

describe("service-expiry", () => {
  it("expires 90 days after the given instant", () => {
    expect(SERVICE_EXPIRY_DAYS).toBe(90);
    const now = new Date("2026-07-05T00:00:00.000Z");
    expect(computeExpiry(now).toISOString()).toBe("2026-10-03T00:00:00.000Z");
  });
});
