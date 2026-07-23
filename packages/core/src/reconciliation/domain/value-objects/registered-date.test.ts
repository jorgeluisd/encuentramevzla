import { RegisteredDate } from "./registered-date";

describe("RegisteredDate", () => {
  it("preserves the raw value always", () => {
    expect(RegisteredDate.fromRaw("  basura ").raw).toBe("  basura ");
    expect(RegisteredDate.fromRaw("").raw).toBe("");
  });

  it("parses ISO datetime (as the adapter delivers Excel dates)", () => {
    expect(RegisteredDate.fromRaw("2026-06-25T14:30:00.000Z").iso).toBe("2026-06-25");
    expect(RegisteredDate.fromRaw("2026-06-25").iso).toBe("2026-06-25");
  });

  it("parses dd/mm/yyyy and dd-mm-yyyy textual dates (Venezuelan order)", () => {
    expect(RegisteredDate.fromRaw("25/06/2026").iso).toBe("2026-06-25");
    expect(RegisteredDate.fromRaw("25-06-2026").iso).toBe("2026-06-25");
    expect(RegisteredDate.fromRaw("1/6/26").iso).toBe("2026-06-01");
  });

  it("takes the first date of a range only when it carries a year", () => {
    expect(RegisteredDate.fromRaw("25/06/2026-26/06/2026").iso).toBe("2026-06-25");
    // Rango sin año: best-effort ⇒ null (no se inventa el año).
    expect(RegisteredDate.fromRaw("25/06-26/06").iso).toBeNull();
  });

  it("returns null for empty, garbage header, and impossible dates", () => {
    expect(RegisteredDate.fromRaw("").iso).toBeNull();
    expect(RegisteredDate.fromRaw("   ").iso).toBeNull();
    expect(RegisteredDate.fromRaw("Fecha Actualización").iso).toBeNull();
    expect(RegisteredDate.fromRaw("no es fecha").iso).toBeNull();
    expect(RegisteredDate.fromRaw("31/02/2026").iso).toBeNull(); // 31 de febrero
    // Artefacto de export conocido en HORA REG. (mes 30) ⇒ null.
    expect(RegisteredDate.fromRaw("12/30/1899").iso).toBeNull();
  });
});
