import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // El esquema y la lib de ingesta son TS sin transpilar dentro del workspace.
  transpilePackages: ["@registro/db", "@registro/ingesta"],

  // --- PWA-ready (sin activar Service Worker todavía) ---
  // Cuando se active la PWA: añadir manifest.json + registrar SW (p.ej. con next-pwa
  // o un SW propio en /public). Por ahora NO registramos SW para evitar caché agresiva
  // durante el desarrollo del MVP humanitario.
};

export default nextConfig;
