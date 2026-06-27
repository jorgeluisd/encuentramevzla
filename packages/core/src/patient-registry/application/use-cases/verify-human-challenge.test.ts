import type { HumanVerificationGateway } from "../ports/human-verification-gateway";
import { VerifyHumanChallenge } from "./verify-human-challenge";

class FakeVerifier implements HumanVerificationGateway {
  calls: { token: string; remoteIp?: string }[] = [];
  constructor(private readonly ok: boolean) {}
  async verify(token: string, remoteIp?: string): Promise<boolean> {
    this.calls.push({ token, remoteIp });
    return this.ok;
  }
}

describe("VerifyHumanChallenge", () => {
  it("rejects an empty token without hitting the gateway", async () => {
    const verifier = new FakeVerifier(true);
    const ok = await new VerifyHumanChallenge(verifier).execute("  ");
    expect(ok).toBe(false);
    expect(verifier.calls).toHaveLength(0);
  });

  it("delegates a present token to the gateway and returns its verdict", async () => {
    const verifier = new FakeVerifier(true);
    const ok = await new VerifyHumanChallenge(verifier).execute("tok", "1.2.3.4");
    expect(ok).toBe(true);
    expect(verifier.calls).toEqual([{ token: "tok", remoteIp: "1.2.3.4" }]);
  });

  it("returns false when the gateway rejects the token", async () => {
    const verifier = new FakeVerifier(false);
    const ok = await new VerifyHumanChallenge(verifier).execute("tok");
    expect(ok).toBe(false);
  });
});
