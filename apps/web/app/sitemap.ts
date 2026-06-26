import type { MetadataRoute } from "next";

const SITE_URL = "https://encuentramevzla.com";

// Sitemap con las rutas públicas (admin y buscar quedan fuera / noindex).
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/emergencias`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/confianza`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
