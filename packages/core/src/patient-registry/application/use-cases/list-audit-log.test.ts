import { ListAuditLog } from "./list-audit-log";
import type {
  AuditLogReader,
  AuditRecord,
} from "../ports/audit-log-reader";

// Reader fake: registra el límite recibido.
class FakeReader implements AuditLogReader {
  lastLimit: number | null = null;
  async listRecent(limit: number): Promise<AuditRecord[]> {
    this.lastLimit = limit;
    return [];
  }
}

describe("ListAuditLog", () => {
  it("uses 50 by default", async () => {
    const reader = new FakeReader();
    await new ListAuditLog(reader).execute();
    expect(reader.lastLimit).toBe(50);
  });

  it("clamps non-positive limits up to 1", async () => {
    const reader = new FakeReader();
    await new ListAuditLog(reader).execute(0);
    expect(reader.lastLimit).toBe(1);
    await new ListAuditLog(reader).execute(-9);
    expect(reader.lastLimit).toBe(1);
  });

  it("clamps large limits down to 200", async () => {
    const reader = new FakeReader();
    await new ListAuditLog(reader).execute(5000);
    expect(reader.lastLimit).toBe(200);
  });

  it("passes a value within range untouched", async () => {
    const reader = new FakeReader();
    await new ListAuditLog(reader).execute(30);
    expect(reader.lastLimit).toBe(30);
  });
});
