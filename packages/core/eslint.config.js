import { base, onion } from "@evzla/config/eslint";

const REGISTRY = "./src/patient-registry";
const RECON = "./src/reconciliation";

export default [
  ...base,
  // Onion: el dominio no conoce a nadie + @evzla/core debe quedar PURO (sin I/O ni UI).
  onion({
    zones: [
      {
        target: `${REGISTRY}/domain`,
        from: `${REGISTRY}/application`,
        message:
          "Onion: el dominio no puede importar de application (las dependencias apuntan hacia adentro).",
      },
      {
        target: `${REGISTRY}/domain`,
        from: `${REGISTRY}/infrastructure`,
        message: "Onion: el dominio no puede importar de infrastructure.",
      },
      {
        target: `${RECON}/domain`,
        from: `${RECON}/application`,
        message:
          "Onion: el dominio de reconciliation no puede importar de application.",
      },
    ],
    forbidImports: [
      {
        group: [
          "drizzle-orm",
          "drizzle-orm/*",
          "postgres",
          "xlsx",
          "next",
          "next/*",
          "react",
          "react-dom",
          "fs",
          "node:*",
        ],
        message:
          "Pureza de @evzla/core: el dominio/aplicación no puede importar I/O ni libs externas (van en infrastructure).",
      },
    ],
  }),
  // Los tests sí pueden usar el runner.
  {
    files: ["**/*.test.ts"],
    rules: { "no-restricted-imports": "off" },
  },
];
