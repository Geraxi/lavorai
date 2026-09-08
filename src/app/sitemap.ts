import type { MetadataRoute } from "next";
import { GUIDES } from "@/content/guide";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";
  // Date fisse per le pagine statiche: un lastModified che cambia a ogni
  // richiesta è ignorato da Google e riduce la fiducia nella sitemap.
  const now = new Date("2026-09-08");
  const guides: MetadataRoute.Sitemap = [
    { url: `${base}/guide`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    ...GUIDES.map((g) => ({ url: `${base}/guide/${g.slug}`, lastModified: new Date(g.updated), changeFrequency: "monthly" as const, priority: 0.75 })),
  ];
  return [
    { url: `${base}/`, lastModified: now, priority: 1 },
    // SEO landing per keyword ad alta intent commerciale
    { url: `${base}/auto-candidatura`, lastModified: now, priority: 0.95 },
    { url: `${base}/pricing`, lastModified: now, priority: 0.9 },
    { url: `${base}/proof`, lastModified: now, priority: 0.85 },
    { url: `${base}/optimize`, lastModified: now, priority: 0.8 },
    { url: `${base}/analizza-cv`, lastModified: now, priority: 0.75 },
    { url: `${base}/interview-buddy`, lastModified: now, priority: 0.7 },
    ...guides,
    { url: `${base}/login`, lastModified: now, priority: 0.5 },
    { url: `${base}/signup`, lastModified: now, priority: 0.6 },
    { url: `${base}/contatti`, lastModified: now, priority: 0.3 },
    { url: `${base}/privacy`, lastModified: now, priority: 0.3 },
    { url: `${base}/termini`, lastModified: now, priority: 0.3 },
  ];
}
