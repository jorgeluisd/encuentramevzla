import { ResolveTeamMember } from "./resolve-team-member";
import type {
  TeamMember,
  TeamMemberRepository,
} from "../ports/team-member-repository";

// Repo fake: registra el email recibido y resuelve desde un mapa por email exacto.
class FakeRepo implements TeamMemberRepository {
  lastEmail: string | null = null;
  constructor(private readonly byEmail: Record<string, TeamMember>) {}
  async findByEmail(email: string): Promise<TeamMember | null> {
    this.lastEmail = email;
    return this.byEmail[email] ?? null;
  }
}

const active: TeamMember = {
  id: "m1",
  email: "ana@hospital.org",
  role: "moderator",
  hospitalId: null,
  active: true,
};

describe("ResolveTeamMember", () => {
  it("authorizes an active member", async () => {
    const result = await new ResolveTeamMember(
      new FakeRepo({ "ana@hospital.org": active }),
    ).execute("ana@hospital.org");
    expect(result).toEqual({ kind: "authorized", member: active });
  });

  it("rejects an inactive member", async () => {
    const result = await new ResolveTeamMember(
      new FakeRepo({ "ana@hospital.org": { ...active, active: false } }),
    ).execute("ana@hospital.org");
    expect(result).toEqual({ kind: "unauthorized" });
  });

  it("rejects an unknown email", async () => {
    const result = await new ResolveTeamMember(new FakeRepo({})).execute(
      "nadie@x.org",
    );
    expect(result).toEqual({ kind: "unauthorized" });
  });

  it("normalizes the email (trim + lowercase) before lookup", async () => {
    const repo = new FakeRepo({ "ana@hospital.org": active });
    const result = await new ResolveTeamMember(repo).execute("  Ana@Hospital.ORG ");
    expect(repo.lastEmail).toBe("ana@hospital.org");
    expect(result).toEqual({ kind: "authorized", member: active });
  });
});
