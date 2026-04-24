import { prisma } from "@/lib/db";
import { fetchGreenhouseMulti } from "./greenhouse";
import { fetchLeverMulti } from "./lever";
import {
  fetchLinkedinViaApify,
  DEFAULT_LINKEDIN_QUERIES,
} from "./linkedin-apify";
import { GREENHOUSE_COMPANIES, LEVER_COMPANIES } from "./ats-companies";
import type { JobListItem } from "@/lib/adzuna";

/**
 * Sync job da Greenhouse + Lever pubblici — ogni URL restituito è
 * direttamente compatibile coi nostri adapter (boards.greenhouse.io/...,
 * jobs.lever.co/...). Nessun wrapper, submit reale.
 *
 * Upsert su (externalId, source) — deduplica correttamente.
 */
export async function syncAtsJobs(): Promise<{
  greenhouse: number;
  lever: number;
  linkedin: number;
  total: number;
}> {
  console.log("[sync-jobs] starting Greenhouse + Lever + LinkedIn(Apify) fetch...");
  const [gh, lv, li] = await Promise.all([
    fetchGreenhouseMulti(GREENHOUSE_COMPANIES, 4),
    fetchLeverMulti(LEVER_COMPANIES, 4),
    // LinkedIn via Apify: fallisce silente se APIFY_TOKEN non è settato.
    // I job tenuti hanno applyUrl su Greenhouse/Lever/Workable/BambooHR,
    // quindi il submit resta sul form ATS reale — niente automazione su LinkedIn.
    // 25 query × 25 righe = ~625 scan max. Il filtro ATS-supportati in
    // genere tiene il 2-10% → 15-60 job utili per sync.
    fetchLinkedinViaApify(DEFAULT_LINKEDIN_QUERIES, 25),
  ]);
  console.log(
    `[sync-jobs] greenhouse=${gh.length}  lever=${lv.length}  linkedin=${li.length}`,
  );

  const all = [...gh, ...lv, ...li];
  const upserted = await upsertJobs(all);
  return {
    greenhouse: gh.length,
    lever: lv.length,
    linkedin: li.length,
    total: upserted,
  };
}

async function upsertJobs(items: JobListItem[]): Promise<number> {
  let count = 0;
  // Serial batches di 20 per non martellare Prisma
  const batchSize = 20;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(
      batch.map((j) =>
        prisma.job
          .upsert({
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
              sourceSlug: (j as { sourceSlug?: string | null }).sourceSlug ?? null,
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
              sourceSlug: (j as { sourceSlug?: string | null }).sourceSlug ?? null,
            },
          })
          .then(() => {
            count++;
          })
          .catch((err) => {
            console.warn("[sync-jobs] upsert failed", j.url, err.message);
          }),
      ),
    );
  }
  return count;
}
