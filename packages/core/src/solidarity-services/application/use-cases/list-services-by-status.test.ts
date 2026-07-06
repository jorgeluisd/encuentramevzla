import { ListServicesByStatus } from "./list-services-by-status";
import { InMemoryRepo, makeRecord } from "./_test-fakes";

describe("ListServicesByStatus", () => {
  it("returns a page filtered by the requested status", async () => {
    const repo = new InMemoryRepo();
    repo.seed(makeRecord({ id: "a", status: "approved" }));
    repo.seed(makeRecord({ id: "b", status: "approved" }));
    repo.seed(makeRecord({ id: "c", status: "pending" }));
    const page = await new ListServicesByStatus(repo).execute({ status: "approved" });
    expect(page.total).toBe(2);
    expect(page.items.map((i) => i.id).sort()).toEqual(["a", "b"]);
  });
});
