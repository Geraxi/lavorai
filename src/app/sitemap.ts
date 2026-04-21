import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, priority: 1 },
    { url: `${base}/privacy`, lastModified: now, priority: 0.3 },
    { url: `${base}/termini`, lastModified: now, priority: 0.3 },
    { url: `${base}/contatti`, lastModified: now, priority: 0.3 },
    { url: `${base}/optimize`, lastModified: now, priority: 0.8 },
    { url: `${base}/login`, lastModified: now, priority: 0.5 },
  ];
}
