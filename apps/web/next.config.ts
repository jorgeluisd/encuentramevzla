import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // El esquema y la lib de ingesta son TS sin transpilar dentro del workspace.
  transpilePackages: ["@evzla/core", "@evzla/db"],
  // `postgres` (postgres.js) es nativo de Node: no debe empaquetarse para el cliente.
  serverExternalPackages: ["postgres"],

  experimental: {
    // El default de Server Actions es 1 MB: un .xlsx grande sería rechazado antes
    // de procesarse. Subimos a 8 MB para los archivos reales de los hospitales.
    serverActions: { bodySizeLimit: "8mb" },
  },

  // --- PWA-ready (sin activar Service Worker todavía) ---
  // Cuando se active la PWA: añadir manifest.json + registrar SW (p.ej. con next-pwa
  // o un SW propio en /public). Por ahora NO registramos SW para evitar caché agresiva
  // durante el desarrollo del MVP humanitario.
};

export default nextConfig;
