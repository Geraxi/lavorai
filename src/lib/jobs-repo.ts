import { prisma } from "@/lib/db";
import { searchJobs, type AdzunaSearchParams, type JobListItem } from "@/lib/adzuna";
import type { Job } from "@prisma/client";

/**
 * Job repository: layer sopra Adzuna che cache-a in DB.
 * Chi chiama può sempre usare `Job` come se fosse sempre in DB.
 */

export interface JobsFilter extends AdzunaSearchParams {
  /** filtra solo job remoti */
  remoteOnly?: boolean;
}

/**
 * Cerca job: prima fetch da Adzuna, upsert in DB, ritorna la lista.
 * In MVP non facciamo cache TTL — ogni search è fresh (Adzuna ha rate
 * limit basso su free tier, andrà controllato in produzione).
 */
export async function searchAndCacheJobs(
  filter: JobsFilter = {},
): Promise<Job[]> {
  // 1. Fetch fresco da Adzuna + upsert in DB (come prima)
  const items = await searchJobs(filter);
  const filtered = filter.remoteOnly ? items.filter((j) => j.remote) : items;

  if (filtered.length > 0) {
    await prisma.$transaction(
      filtered.map((j) =>
        prisma.job.upsert({
          where: {
            externalId_source: {
              externalId: j.externalId,
              source: j.source,
            },
          },
          update: {
            title: j.title,
            company: j.company,
            location: j.location,
            description: j.description,
            url: j.url,
            contractType: j.contractType,
            remote: j.remote,
            salaryMin: j.salaryMin,
            salaryMax: j.salaryMax,
            category: j.category,
            postedAt: j.postedAt,
            cachedAt: new Date(),
          },
          create: {
            externalId: j.externalId,
            source: j.source,
            title: j.title,
            company: j.company,
            location: j.location,
            description: j.description,
            url: j.url,
            contractType: j.contractType,
            remote: j.remote,
            salaryMin: j.salaryMin,
            salaryMax: j.salaryMax,
            category: j.category,
            postedAt: j.postedAt,
          },
        }),
      ),
    );
  }

  // 2. Query unificata su TUTTI i source (adzuna + greenhouse + lever + …)
  //    con filtri applicati direttamente in DB.
  type WhereClause = Parameters<typeof prisma.job.findMany>[0] extends
    | { where?: infer W }
    | undefined
    ? NonNullable<W>
    : never;
  const and: WhereClause[] = [];
  if (filter.what) {
    const q = filter.what.trim();
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { company: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (filter.where) {
    const loc = filter.where.trim();
    and.push({
      OR: [
        { location: { contains: loc, mode: "insensitive" } },
        { remote: true },
      ],
    });
  }
  if (filter.remoteOnly) {
    and.push({ remote: true });
  }
  if (filter.salaryMin) {
    and.push({
      OR: [
        { salaryMin: { gte: filter.salaryMin } },
        { salaryMax: { gte: filter.salaryMin } },
      ],
    });
  }
  const finalWhere = and.length > 0 ? { AND: and } : {};

  return prisma.job.findMany({
    where: finalWhere,
    orderBy: [
      // Priorità: Greenhouse/Lever (submit diretto) prima di Adzuna (scraping fragile)
      { source: "asc" },
      { postedAt: "desc" },
    ],
    take: 200,
  });
}

export async function getJobById(id: string): Promise<Job | null> {
  return prisma.job.findUnique({ where: { id } });
}

/**
 * Helper UI per rendering dei filtri: ritorna location e categorie
 * uniche dal cache corrente.
 */
export async function getJobFacets() {
  const jobs = await prisma.job.findMany({
    select: { location: true, category: true, contractType: true },
    take: 500,
  });
  return {
    locations: unique(jobs.map((j) => j.location).filter(Boolean) as string[]),
    categories: unique(jobs.map((j) => j.category).filter(Boolean) as string[]),
    contractTypes: unique(
      jobs.map((j) => j.contractType).filter(Boolean) as string[],
    ),
  };
}

function unique(arr: string[]): string[] {
  return Array.from(new Set(arr)).sort();
}

/**
 * Formatta una fascia salariale per UI.
 */
export function formatSalary(min: number | null, max: number | null): string | null {
  if (!min && !max) return null;
  const fmt = (n: number) => `€${(n / 1000).toFixed(0)}k`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  if (min) return `da ${fmt(min)}`;
  if (max) return `fino a ${fmt(max)}`;
  return null;
}

export function formatRelativeDate(d: Date | null): string {
  if (!d) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86400_000);
  if (days === 0) return "Oggi";
  if (days === 1) return "Ieri";
  if (days < 7) return `${days} giorni fa`;
  if (days < 30) return `${Math.floor(days / 7)} sett. fa`;
  return `${Math.floor(days / 30)} mesi fa`;
}
