import { prisma } from "@/lib/db";
import { jobDatePosted } from "@/lib/job-seo";

export const runtime = "nodejs";
export const revalidate = 3600;

/**
 * Sitemap delle offerte pubbliche /lavoro/[id] (Google for Jobs).
 * Separata da /sitemap.xml (pagine statiche) e dichiarata in robots.txt.
 * Solo annunci aperti e aggiornati negli ultimi 30 giorni, max 5000.
 */
export async function GET() {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";
  const jobs = await prisma.job.findMany({
    where: { closedAt: null, cachedAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } },
    orderBy: { cachedAt: "desc" },
    take: 5000,
    select: { id: true, cachedAt: true, postedAt: true },
  });
  const urls = jobs
    .map((j) => `<url><loc>${base}/lavoro/${j.id}</loc><lastmod>${jobDatePosted(j).toISOString().slice(0, 10)}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`)
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${base}/lavoro</loc><changefreq>hourly</changefreq><priority>0.8</priority></url>${urls}</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
