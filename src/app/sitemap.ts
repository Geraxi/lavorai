import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, priority: 1 },
    // SEO landing per keyword ad alta intent commerciale
    { url: `${base}/auto-candidatura`, lastModified: now, priority: 0.95 },
    { url: `${base}/pricing`, lastModified: now, priority: 0.9 },
    { url: `${base}/proof`, lastModified: now, priority: 0.85 },
    { url: `${base}/optimize`, lastModified: now, priority: 0.8 },
    { url: `${base}/analizza-cv`, lastModified: now, priority: 0.75 },
    { url: `${base}/interview-buddy`, lastModified: now, priority: 0.7 },
    { url: `${base}/login`, lastModified: now, priority: 0.5 },
    { url: `${base}/signup`, lastModified: now, priority: 0.6 },
    { url: `${base}/contatti`, lastModified: now, priority: 0.3 },
    { url: `${base}/privacy`, lastModified: now, priority: 0.3 },
    { url: `${base}/termini`, lastModified: now, priority: 0.3 },
  ];
}
