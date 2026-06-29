// Preset ESLint (flat config) compartido por el monorepo.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";

/** @type {import("eslint").Linter.Config[]} */
export const base = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/**", ".next/**", ".turbo/**", "node_modules/**"],
  },
];

/**
 * Regla de dependencia Onion: hace que ESLint "chille" si una capa importa hacia
 * afuera (el dominio no conoce a nadie). `zones` prohíbe pares target→from (los
 * archivos en `target` no pueden importar desde `from`); `forbidImports` veta
 * paquetes externos por capa (p. ej. mantener `core` puro, sin I/O ni libs de UI).
 *
 * @param {{ zones?: Array<{target:string, from:string, message:string}>,
 *           forbidImports?: Array<{group:string[], message:string}> }} opts
 * @returns {import("eslint").Linter.Config}
 */
export function onion({ zones = [], forbidImports = [] } = {}) {
  return {
    plugins: { import: importPlugin },
    // El resolver por defecto solo resuelve .js; sin esto no detecta imports a .ts.
    settings: {
      "import/resolver": { node: { extensions: [".js", ".jsx", ".ts", ".tsx"] } },
    },
    rules: {
      "import/no-restricted-paths": ["error", { zones }],
      ...(forbidImports.length > 0
        ? { "no-restricted-imports": ["error", { patterns: forbidImports }] }
        : {}),
    },
  };
}

export default base;
