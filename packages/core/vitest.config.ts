import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Tests colocados junto a su slice (screaming architecture).
    include: ["src/**/*.test.ts"],
  },
});
