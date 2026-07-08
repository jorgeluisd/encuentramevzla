import { ListAllServices } from "./list-all-services";
import { InMemoryRepo, makeRecord } from "./_test-fakes";

describe("ListAllServices", () => {
  it("returns services of every status (not only pending/approved)", async () => {
    const repo = new InMemoryRepo();
    repo.seed(makeRecord({ id: "a", status: "approved" }));
    repo.seed(makeRecord({ id: "b", status: "rejected" }));
    repo.seed(makeRecord({ id: "c", status: "removed" }));
    repo.seed(makeRecord({ id: "d", status: "expired" }));
    const page = await new ListAllServices(repo).execute();
    expect(page.total).toBe(4);
    expect(page.items.map((i) => i.id).sort()).toEqual(["a", "b", "c", "d"]);
  });
});
