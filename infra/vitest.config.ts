import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", "cdk.out/**"],
    // El synth con bundling de esbuild tarda más que el default.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
