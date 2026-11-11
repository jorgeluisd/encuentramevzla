import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useHydrated } from "./use-hydrated";

function HydrationProbe() {
  return createElement("span", null, String(useHydrated()));
}

describe("useHydrated", () => {
  it("reports not hydrated while rendering on the server", () => {
    expect(renderToString(createElement(HydrationProbe))).toBe("<span>false</span>");
  });
});
