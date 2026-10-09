import { describe, expect, it } from "vitest";
import { safeErrorTag } from "./safe-error";

describe("safeErrorTag", () => {
  it("solo nombre y código: nunca el mensaje (puede traer emails o parámetros de la query)", () => {
    const error = Object.assign(new Error("Failed query ... params: ana@example.com"), {
      name: "DrizzleQueryError",
      cause: { code: "23505" },
    });
    expect(safeErrorTag(error)).toBe("DrizzleQueryError:23505");
  });

  it("errores sin código ni Error", () => {
    expect(safeErrorTag(new TypeError("x ana@example.com"))).toBe("TypeError");
    expect(safeErrorTag("ana@example.com")).toBe("unknown");
  });
});
