import type { MetadataRoute } from "next";

const SITE_URL = "https://encuentramevzla.com";

// robots.txt: público indexable, /admin bloqueado, apunta al sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/admin" },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
