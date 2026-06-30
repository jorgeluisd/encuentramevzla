import type { CreatedHospital, HospitalAdmin } from "../ports/hospital-admin";
import type { TeamMember } from "../ports/team-member-repository";
import type { TeamMemberAdmin } from "../ports/team-member-admin";
import { CreateHospital } from "./create-hospital";
import { InviteTeamMember } from "./invite-team-member";
import { SetTeamMemberAccess } from "./set-team-member-access";
import {
  EmailAlreadyMemberError,
  InvalidTeamInputError,
  TeamAdminForbiddenError,
  TeamMemberNotFoundError,
} from "./team-admin-errors";

class FakeHospitalAdmin implements HospitalAdmin {
  created: { name: string; city?: string | null; infoDeskPhone?: string | null }[] = [];
  async create(input: { name: string; city?: string | null; infoDeskPhone?: string | null }): Promise<CreatedHospital> {
    this.created.push(input);
    return { id: `ho-${this.created.length}`, name: input.name };
  }
}

const member = (over: Partial<TeamMember>): TeamMember => ({
  id: "tm-1",
  email: "x@hosp.test",
  role: "uploader",
  hospitalId: "ho-1",
  active: true,
  ...over,
});

class FakeTeamAdmin implements TeamMemberAdmin {
  members: TeamMember[];
  created: { email: string; role: TeamMember["role"]; hospitalId: string | null }[] = [];
  access: { id: string; changes: { role?: TeamMember["role"]; active?: boolean } }[] = [];
  constructor(initial: TeamMember[] = []) {
    this.members = initial;
  }
  async list(hospitalId: string | null): Promise<TeamMember[]> {
    return hospitalId === null ? this.members : this.members.filter((m) => m.hospitalId === hospitalId);
  }
  async findByEmail(email: string): Promise<TeamMember | null> {
    return this.members.find((m) => m.email === email) ?? null;
  }
  async findById(id: string): Promise<TeamMember | null> {
    return this.members.find((m) => m.id === id) ?? null;
  }
  async create(input: { email: string; role: TeamMember["role"]; hospitalId: string | null }): Promise<TeamMember> {
    this.created.push(input);
    const m = member({ id: `tm-${this.created.length + 100}`, ...input });
    this.members.push(m);
    return m;
  }
  async setAccess(id: string, changes: { role?: TeamMember["role"]; active?: boolean }): Promise<void> {
    this.access.push({ id, changes });
  }
}

describe("CreateHospital", () => {
  it("el moderador global crea un hospital", async () => {
    const admin = new FakeHospitalAdmin();
    const result = await new CreateHospital(admin).execute({
      actor: { role: "moderator" },
      name: "  Hospital Central  ",
      city: "Caracas",
    });
    expect(result.name).toBe("Hospital Central"); // trim
    expect(admin.created[0]!.city).toBe("Caracas");
  });

  it("un hospital_admin NO crea hospitales", async () => {
    const admin = new FakeHospitalAdmin();
    await expect(
      new CreateHospital(admin).execute({ actor: { role: "hospital_admin" }, name: "X" }),
    ).rejects.toBeInstanceOf(TeamAdminForbiddenError);
    expect(admin.created).toHaveLength(0);
  });

  it("rechaza nombre vacío", async () => {
    await expect(
      new CreateHospital(new FakeHospitalAdmin()).execute({ actor: { role: "moderator" }, name: "   " }),
    ).rejects.toBeInstanceOf(InvalidTeamInputError);
  });
});

describe("InviteTeamMember", () => {
  it("el moderador invita a cualquier hospital", async () => {
    const team = new FakeTeamAdmin();
    await new InviteTeamMember(team).execute({
      actor: { role: "moderator", hospitalId: null },
      email: "Nueva@Hosp.test",
      role: "uploader",
      hospitalId: "ho-2",
    });
    expect(team.created[0]).toEqual({ email: "nueva@hosp.test", role: "uploader", hospitalId: "ho-2" });
  });

  it("el moderador puede crear otro moderador global (sin hospital)", async () => {
    const team = new FakeTeamAdmin();
    await new InviteTeamMember(team).execute({
      actor: { role: "moderator", hospitalId: null },
      email: "mod@hosp.test",
      role: "moderator",
      hospitalId: "ho-2", // se ignora: moderador es global
    });
    expect(team.created[0]!.hospitalId).toBeNull();
  });

  it("el hospital_admin solo invita a SU hospital (fuerza el hospitalId)", async () => {
    const team = new FakeTeamAdmin();
    await new InviteTeamMember(team).execute({
      actor: { role: "hospital_admin", hospitalId: "ho-1" },
      email: "u@hosp.test",
      role: "uploader",
      hospitalId: "ho-9", // intenta otro → se fuerza a ho-1
    });
    expect(team.created[0]!.hospitalId).toBe("ho-1");
  });

  it("el hospital_admin NO puede crear moderadores globales", async () => {
    const team = new FakeTeamAdmin();
    await expect(
      new InviteTeamMember(team).execute({
        actor: { role: "hospital_admin", hospitalId: "ho-1" },
        email: "x@hosp.test",
        role: "moderator",
        hospitalId: null,
      }),
    ).rejects.toBeInstanceOf(TeamAdminForbiddenError);
  });

  it("un uploader no puede invitar", async () => {
    await expect(
      new InviteTeamMember(new FakeTeamAdmin()).execute({
        actor: { role: "uploader", hospitalId: "ho-1" },
        email: "x@hosp.test",
        role: "uploader",
        hospitalId: "ho-1",
      }),
    ).rejects.toBeInstanceOf(TeamAdminForbiddenError);
  });

  it("un rol acotado exige hospital", async () => {
    await expect(
      new InviteTeamMember(new FakeTeamAdmin()).execute({
        actor: { role: "moderator", hospitalId: null },
        email: "x@hosp.test",
        role: "uploader",
        hospitalId: null,
      }),
    ).rejects.toBeInstanceOf(InvalidTeamInputError);
  });

  it("rechaza email inválido y email ya existente", async () => {
    const team = new FakeTeamAdmin([member({ email: "ya@hosp.test" })]);
    await expect(
      new InviteTeamMember(team).execute({
        actor: { role: "moderator", hospitalId: null },
        email: "no-es-email",
        role: "uploader",
        hospitalId: "ho-1",
      }),
    ).rejects.toBeInstanceOf(InvalidTeamInputError);
    await expect(
      new InviteTeamMember(team).execute({
        actor: { role: "moderator", hospitalId: null },
        email: "ya@hosp.test",
        role: "uploader",
        hospitalId: "ho-1",
      }),
    ).rejects.toBeInstanceOf(EmailAlreadyMemberError);
  });
});

describe("SetTeamMemberAccess", () => {
  it("el moderador cambia rol/activo de cualquiera", async () => {
    const team = new FakeTeamAdmin([member({ id: "tm-9", hospitalId: "ho-2" })]);
    await new SetTeamMemberAccess(team).execute({
      actor: { role: "moderator", hospitalId: null },
      memberId: "tm-9",
      changes: { active: false },
    });
    expect(team.access[0]).toEqual({ id: "tm-9", changes: { active: false } });
  });

  it("el hospital_admin solo gestiona a su personal", async () => {
    const team = new FakeTeamAdmin([member({ id: "tm-9", hospitalId: "ho-2" })]);
    await expect(
      new SetTeamMemberAccess(team).execute({
        actor: { role: "hospital_admin", hospitalId: "ho-1" },
        memberId: "tm-9",
        changes: { active: false },
      }),
    ).rejects.toBeInstanceOf(TeamAdminForbiddenError);
    expect(team.access).toHaveLength(0);
  });

  it("el hospital_admin no eleva a moderador global", async () => {
    const team = new FakeTeamAdmin([member({ id: "tm-9", hospitalId: "ho-1" })]);
    await expect(
      new SetTeamMemberAccess(team).execute({
        actor: { role: "hospital_admin", hospitalId: "ho-1" },
        memberId: "tm-9",
        changes: { role: "moderator" },
      }),
    ).rejects.toBeInstanceOf(TeamAdminForbiddenError);
  });

  it("lanza si el miembro no existe", async () => {
    await expect(
      new SetTeamMemberAccess(new FakeTeamAdmin()).execute({
        actor: { role: "moderator", hospitalId: null },
        memberId: "nope",
        changes: { active: true },
      }),
    ).rejects.toBeInstanceOf(TeamMemberNotFoundError);
  });
});
