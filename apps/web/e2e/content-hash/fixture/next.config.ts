import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// El fixture importa componentes de apps/web: Turbopack necesita la raíz del repo para resolverlos.
const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;
