import tseslint from "typescript-eslint";
import { onion } from "@evzla/config/eslint";

// Config enfocado: solo la guardia Onion (parser TS sin reglas de estilo, para no
// abrir ruido en todo el Next). La pureza del dominio se vigila en @evzla/core.
const onionWeb = onion({
  zones: [
    {
      target: "./lib/infrastructure",
      from: "./app",
      message: "Onion: la infraestructura no puede importar de presentación (app/).",
    },
    {
      target: "./lib/infrastructure",
      from: "./components",
      message: "Onion: la infraestructura no puede importar de presentación (components/).",
    },
  ],
});

export default [
  { ignores: [".next/**", ".turbo/**", "node_modules/**", "next-env.d.ts"] },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: { parser: tseslint.parser },
  },
  { ...onionWeb, files: ["**/*.ts", "**/*.tsx"] },
];
