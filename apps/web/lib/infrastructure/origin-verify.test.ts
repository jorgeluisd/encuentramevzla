import { describe, expect, it } from "vitest";
import { isOriginVerified } from "./origin-verify";

const SECRET = ["fake", "origin", "value"].join("-");

describe("isOriginVerified", () => {
  it("sin secreto configurado (local) no se chequea nada", () => {
    expect(isOriginVerified(null, undefined)).toBe(true);
    expect(isOriginVerified(null, "")).toBe(true);
  });

  it("con secreto: acepta solo el header exacto", () => {
    expect(isOriginVerified(SECRET, SECRET)).toBe(true);
    expect(isOriginVerified(`${SECRET}x`, SECRET)).toBe(false);
    expect(isOriginVerified(SECRET.slice(1), SECRET)).toBe(false);
    expect(isOriginVerified("", SECRET)).toBe(false);
    expect(isOriginVerified(null, SECRET)).toBe(false);
  });
});
