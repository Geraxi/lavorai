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
  const items = await searchJobs(filter);
  const filtered = filter.remoteOnly ? items.filter((j) => j.remote) : items;

  // Upsert batch — singola transaction per minimizzare round-trips SQLite
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

  // Ritorniamo i Job come sono in DB (inclusi id generati)
  return prisma.job.findMany({
    where: {
      externalId: { in: filtered.map((j) => j.externalId) },
      source: { in: Array.from(new Set(filtered.map((j) => j.source))) },
    },
    orderBy: { postedAt: "desc" },
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
