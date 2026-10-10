import { describe, expect, it } from "vitest";
import { createIdTokenVerifier } from "./cognito-id-token-verifier";

describe("createIdTokenVerifier", () => {
  it("un token malformado no es una sesión (null, sin lanzar)", async () => {
    const verify = createIdTokenVerifier("sa-east-1_AbCdEf123", "client-id");
    expect(await verify("no-es-un-jwt")).toBeNull();
  });
});
