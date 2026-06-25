// Preset ESLint (flat config) compartido por el monorepo.
// Stub mínimo: extiende recomendaciones de JS + TS. Ampliar por app según necesidad.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** @type {import("eslint").Linter.Config[]} */
export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/**", ".next/**", ".turbo/**", "node_modules/**"],
  },
];
