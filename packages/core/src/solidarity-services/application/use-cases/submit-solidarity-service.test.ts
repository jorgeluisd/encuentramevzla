import type {
  NewSolidarityServiceRecord,
  SolidarityServiceRecord,
  SolidarityServiceRepository,
} from "../ports/solidarity-service-repository";
import { SubmitSolidarityService } from "./submit-solidarity-service";
import {
  InvalidServiceInputError,
  TermsNotAcceptedError,
  TooManyActiveServicesError,
} from "./solidarity-errors";

class FakeRepo implements SolidarityServiceRepository {
  created: NewSolidarityServiceRecord[] = [];
  activeByEmail = 0;
  async create(record: NewSolidarityServiceRecord): Promise<void> {
    this.created.push(record);
  }
  async countActiveByEmail(): Promise<number> {
    return this.activeByEmail;
  }
  async listByStatus() {
    return { items: [] as SolidarityServiceRecord[], total: 0 };
  }
  async findById(): Promise<SolidarityServiceRecord | null> {
    return null;
  }
  async findByTokenHash(): Promise<SolidarityServiceRecord | null> {
    return null;
  }
  async updateById(): Promise<void> {}
}

const NOW = new Date("2026-07-05T00:00:00.000Z");

function makeUseCase(repo: SolidarityServiceRepository) {
  return new SubmitSolidarityService({
    repo,
    newId: () => "id-1",
    newToken: () => "tok-raw",
    hashToken: (t) => `hash(${t})`,
    now: () => NOW,
  });
}

const validInput = {
  title: "Inspección estructural de edificios",
  category: "Ingeniería y evaluación estructural",
  description: "Reviso estructuras dañadas por el sismo, sin costo.",
  contactPhone: "+58 412 123 4567",
  submitterEmail: "Ana@Example.CO",
  acceptedTerms: true,
};

describe("SubmitSolidarityService", () => {
  it("creates a pending service, hashes the token and returns the raw token", async () => {
    const repo = new FakeRepo();
    const result = await makeUseCase(repo).execute(validInput);

    expect(result.id).toBe("id-1");
    expect(result.editToken).toBe("tok-raw");
    expect(result.expiresAt.toISOString()).toBe("2026-10-03T00:00:00.000Z");

    expect(repo.created).toHaveLength(1);
    const rec = repo.created[0]!;
    expect(rec.status).toBe("pending");
    expect(rec.editTokenHash).toBe("hash(tok-raw)");
    expect(rec.submitterEmail).toBe("ana@example.co");
    expect(rec.expiresAt.toISOString()).toBe("2026-10-03T00:00:00.000Z");
    expect(rec.acceptedTermsAt.toISOString()).toBe(NOW.toISOString());
  });

  it("rejects when terms are not accepted and persists nothing", async () => {
    const repo = new FakeRepo();
    await expect(
      makeUseCase(repo).execute({ ...validInput, acceptedTerms: false }),
    ).rejects.toBeInstanceOf(TermsNotAcceptedError);
    expect(repo.created).toHaveLength(0);
  });

  it("rejects when the email already has 3 active services", async () => {
    const repo = new FakeRepo();
    repo.activeByEmail = 3;
    await expect(makeUseCase(repo).execute(validInput)).rejects.toBeInstanceOf(
      TooManyActiveServicesError,
    );
    expect(repo.created).toHaveLength(0);
  });

  it("rejects invalid input (bad category)", async () => {
    const repo = new FakeRepo();
    await expect(
      makeUseCase(repo).execute({ ...validInput, category: "Cripto" }),
    ).rejects.toBeInstanceOf(InvalidServiceInputError);
    expect(repo.created).toHaveLength(0);
  });

  it("rejects invalid input (short title)", async () => {
    const repo = new FakeRepo();
    await expect(
      makeUseCase(repo).execute({ ...validInput, title: "ab" }),
    ).rejects.toBeInstanceOf(InvalidServiceInputError);
  });
});
