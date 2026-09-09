import { prisma } from "@/lib/db";

/**
 * Scopre nuovi tenant ATS guardando gli URL degli annunci già in pool
 * (Adzuna, LinkedIn, EURES, demand): se un annuncio punta a
 * <x>.jobs.personio.de, <x>.teamtailor.com, <x>.recruitee.com o
 * <x>.bamboohr.com, quel tenant ha un feed pubblico che possiamo leggere
 * per intero. Così la copertura cresce da sola, senza liste curate.
 */
export type DiscoveredTenants = Record<"personio" | "teamtailor" | "recruitee" | "bamboohr" | "breezy" | "pinpoint" | "join", string[]>;

const HOST_RULES: Array<{ key: keyof DiscoveredTenants; re: RegExp }> = [
  { key: "personio", re: /^([a-z0-9-]+)\.jobs\.personio\.(?:de|com)$/i },
  { key: "teamtailor", re: /^([a-z0-9-]+)\.teamtailor\.com$/i },
  { key: "recruitee", re: /^([a-z0-9-]+)\.recruitee\.com$/i },
  { key: "bamboohr", re: /^([a-z0-9-]+)\.bamboohr\.com$/i },
  { key: "breezy", re: /^([a-z0-9-]+)\.breezy\.hr$/i },
  { key: "pinpoint", re: /^([a-z0-9-]+)\.pinpointhq\.com$/i },
];

export async function discoverTenantsFromPool(): Promise<DiscoveredTenants> {
  const out: DiscoveredTenants = { personio: [], teamtailor: [], recruitee: [], bamboohr: [], breezy: [], pinpoint: [], join: [] };
  try {
    const rows = await prisma.job.findMany({
      where: {
        OR: [
          { url: { contains: "jobs.personio." } },
          { url: { contains: ".teamtailor.com" } },
          { url: { contains: ".recruitee.com" } },
          { url: { contains: ".bamboohr.com" } },
          { url: { contains: ".breezy.hr" } },
          { url: { contains: ".pinpointhq.com" } },
          { url: { contains: "join.com/companies/" } },
        ],
      },
      select: { url: true },
      take: 5000,
    });
    const sets: Record<string, Set<string>> = { personio: new Set(), teamtailor: new Set(), recruitee: new Set(), bamboohr: new Set(), breezy: new Set(), pinpoint: new Set(), join: new Set() };
    for (const r of rows) {
      let host = "";
      try { host = new URL(r.url).hostname.toLowerCase(); } catch { continue; }
      // JOIN: il tenant è nel path, non nell'host.
      const jm = r.url.match(/join\.com\/companies\/([a-z0-9-]+)/i);
      if (jm) sets.join.add(jm[1].toLowerCase());
      for (const rule of HOST_RULES) {
        const m = host.match(rule.re);
        if (m && !["www", "jobs", "career", "careers", "app", "api"].includes(m[1])) sets[rule.key].add(m[1]);
      }
    }
    for (const k of Object.keys(sets) as (keyof DiscoveredTenants)[]) out[k] = [...sets[k]];
  } catch (err) {
    console.warn("[tenant-discovery] failed", err instanceof Error ? err.message : err);
  }
  return out;
}
