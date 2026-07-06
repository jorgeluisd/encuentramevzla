import type {
  ListPublishedInput,
  PublicService,
  SolidarityServiceDirectory,
} from "../ports/solidarity-service-directory";
import { ListPendingServices } from "./list-pending-services";
import { ListPublishedServices } from "./list-published-services";
import { InMemoryRepo, makeRecord } from "./_test-fakes";

describe("ListPendingServices", () => {
  it("returns a page of pending services with total", async () => {
    const repo = new InMemoryRepo();
    repo.seed(makeRecord({ id: "a", status: "pending" }));
    repo.seed(makeRecord({ id: "b", status: "pending" }));
    repo.seed(makeRecord({ id: "c", status: "approved" }));
    const uc = new ListPendingServices(repo);
    const page = await uc.execute({ page: 1, pageSize: 20 });
    expect(page.total).toBe(2);
    expect(page.items.map((i) => i.id).sort()).toEqual(["a", "b"]);
  });
});

class FakeDirectory implements SolidarityServiceDirectory {
  lastInput: ListPublishedInput | null = null;
  rows: PublicService[] = [
    {
      id: "a",
      title: "T",
      category: "Legal y notarial",
      description: "desc",
      contactPhone: "+58 412 000 0000",
      createdAt: new Date("2026-07-05T00:00:00.000Z"),
    },
  ];
  async list(input: ListPublishedInput): Promise<PublicService[]> {
    this.lastInput = input;
    return this.rows;
  }
}

describe("ListPublishedServices", () => {
  it("delegates the filter to the directory and returns its rows", async () => {
    const dir = new FakeDirectory();
    const uc = new ListPublishedServices(dir);
    const rows = await uc.execute({ category: "Legal y notarial", q: "aboga" });
    expect(dir.lastInput).toEqual({ category: "Legal y notarial", q: "aboga" });
    expect(rows).toHaveLength(1);
  });
});
