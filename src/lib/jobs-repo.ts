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
  // 1. Fetch fresco da Adzuna + upsert in DB. Se Adzuna fallisce
  //    (429 rate-limit, network, ecc.) procediamo con i job già in DB —
  //    la cache vale più di un crash. Logghiamo solo a warn.
  let items: JobListItem[] = [];
  try {
    items = await searchJobs(filter);
  } catch (err) {
    console.warn(
      "[jobs-repo] Adzuna fetch failed, falling back to DB:",
      err instanceof Error ? err.message.slice(0, 200) : err,
    );
  }
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
  // `mode: "insensitive"` è valido solo su Postgres. In locale (SQLite)
  // viene rifiutato dal client → omettiamo quando il provider non è pg.
  // SQLite's LIKE è già case-insensitive di default per ASCII.
  const isPg = (process.env.DATABASE_URL ?? "").startsWith("postgres");
  const ci = isPg ? ({ mode: "insensitive" as const }) : ({} as Record<string, never>);

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
        { title: { contains: q, ...ci } },
        { company: { contains: q, ...ci } },
        { description: { contains: q, ...ci } },
        { category: { contains: q, ...ci } },
      ],
    });
  }
  if (filter.where) {
    const loc = filter.where.trim();
    and.push({
      OR: [
        { location: { contains: loc, ...ci } },
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

  // Pesca largo, poi deduplica per (azienda|titolo) preferendo la sorgente
  // più submittabile. Senza questo, lo stesso ruolo compariva due volte —
  // una copia Adzuna (aggregatore, submit via email fragile) e una copia
  // ATS (Greenhouse/Lever, submit diretto) — e l'ordinamento alfabetico
  // metteva Adzuna prima, facendo candidare alla copia sbagliata.
  const rows = await prisma.job.findMany({
    where: finalWhere,
    orderBy: [{ postedAt: "desc" }],
    take: 400,
  });
  return dedupePreferAts(rows).slice(0, 200);
}

/**
 * Priorità sorgente: più alto = preferito quando esistono duplicati dello
 * stesso job. Gli ATS con submit diretto battono gli aggregatori.
 */
function sourceRank(source: string): number {
  switch (source) {
    case "greenhouse":
    case "lever":
    case "workable":
    case "ashby":
    case "smartrecruiters":
      return 3; // submit diretto via adapter
    case "linkedin":
      return 2;
    case "adzuna":
      return 1; // aggregatore, submit fragile
    default:
      return 0;
  }
}

export function dedupePreferAts(jobs: Job[]): Job[] {
  const byKey = new Map<string, Job>();
  const order: string[] = [];
  for (const j of jobs) {
    const key = `${(j.company ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}|${j.title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, j);
      order.push(key);
    } else if (sourceRank(j.source) > sourceRank(existing.source)) {
      byKey.set(key, j); // sostituisci con la copia più submittabile
    }
  }
  return order.map((k) => byKey.get(k)).filter((j): j is Job => Boolean(j));
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
