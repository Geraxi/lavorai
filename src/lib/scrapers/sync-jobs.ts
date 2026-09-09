import { prisma } from "@/lib/db";
import { fetchGreenhouseMulti } from "./greenhouse";
import { fetchLeverMulti } from "./lever";
import { fetchAshbyMulti } from "./ashby";
import { fetchSmartRecruitersMulti } from "./smartrecruiters";
import { fetchWorkableMulti } from "./workable";
import { fetchRecruiteeMulti } from "./recruitee";
import { fetchPersonioMulti } from "./personio";
import { fetchBreezyMulti } from "./breezy";
import { fetchPinpointMulti } from "./pinpoint";
import { fetchJoinMulti } from "./join";
import { fetchRemoteBoards } from "./remote-boards";
import { fetchTeamtailorMulti } from "./teamtailor";
import { fetchBambooMulti } from "./bamboohr";
import { fetchEuresMulti } from "./eures";
import { discoverTenantsFromPool } from "./tenant-discovery";
import { fetchDemandJobs } from "./demand-queries";
import {
  fetchLinkedinViaApify,
  DEFAULT_LINKEDIN_QUERIES,
} from "./linkedin-apify";
import {
  GREENHOUSE_COMPANIES,
  LEVER_COMPANIES,
  ASHBY_COMPANIES,
  SMARTRECRUITERS_COMPANIES,
  WORKABLE_COMPANIES,
  RECRUITEE_COMPANIES,
  PERSONIO_COMPANIES,
  BREEZY_COMPANIES,
  PINPOINT_COMPANIES,
  JOIN_COMPANIES,
  TEAMTAILOR_COMPANIES,
  BAMBOOHR_COMPANIES,
} from "./ats-companies";
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
  ashby: number;
  smartrecruiters: number;
  workable: number;
  linkedin: number;
  demand: number;
  demandQueries: number;
  recruitee: number;
  personio: number;
  teamtailor: number;
  bamboohr: number;
  eures: number;
  breezy: number;
  pinpoint: number;
  join: number;
  remote: number;
  total: number;
}> {
  console.log(
    "[sync-jobs] starting Greenhouse + Lever + Ashby + SmartRecruiters + Workable + LinkedIn(Apify) + Demand(Adzuna) fetch...",
  );
  // Tenant scoperti dagli URL già in pool + seed curati (dedup).
  const disc = await discoverTenantsFromPool();
  const merge = (seed: Array<{ slug: string; name?: string }>, found: string[]) => {
    const seen = new Set(seed.map((c) => c.slug.toLowerCase()));
    return [...seed, ...found.filter((s) => !seen.has(s.toLowerCase())).map((slug) => ({ slug }))];
  };
  const [gh, lv, ash, sr, wk, li, demand, rc, pe, tt, bh, eu, bz, pp, jn, rb] = await Promise.all([
    fetchGreenhouseMulti(GREENHOUSE_COMPANIES, 4),
    fetchLeverMulti(LEVER_COMPANIES, 4),
    fetchAshbyMulti(ASHBY_COMPANIES, 4),
    fetchSmartRecruitersMulti(SMARTRECRUITERS_COMPANIES, 4),
    fetchWorkableMulti(WORKABLE_COMPANIES, 4),
    fetchLinkedinViaApify(DEFAULT_LINKEDIN_QUERIES, 25),
    // Demand-driven: popola il pool con i ruoli che gli utenti reali
    // hanno selezionato (es. "Meteorologo", "Analista Climatico"), non
    // solo i verticali design/dev hard-coded.
    fetchDemandJobs(),
    fetchRecruiteeMulti(merge(RECRUITEE_COMPANIES, disc.recruitee), 4),
    fetchPersonioMulti(merge(PERSONIO_COMPANIES, disc.personio), 4),
    fetchTeamtailorMulti(merge(TEAMTAILOR_COMPANIES, disc.teamtailor), 4),
    fetchBambooMulti(merge(BAMBOOHR_COMPANIES, disc.bamboohr), 3),
    fetchEuresMulti(),
    fetchBreezyMulti(merge(BREEZY_COMPANIES, disc.breezy), 3),
    fetchPinpointMulti(merge(PINPOINT_COMPANIES, disc.pinpoint), 3),
    fetchJoinMulti(merge(JOIN_COMPANIES, disc.join), 2),
    fetchRemoteBoards(),
  ]);
  console.log(`[sync-jobs] recruitee=${rc.length} personio=${pe.length} teamtailor=${tt.length} bamboohr=${bh.length} eures=${eu.length} breezy=${bz.length} pinpoint=${pp.length} join=${jn.length} remote-boards=${rb.length} (tenant scoperti: ${Object.values(disc).flat().length})`);
  console.log(
    `[sync-jobs] greenhouse=${gh.length}  lever=${lv.length}  ashby=${ash.length}  smartrec=${sr.length}  workable=${wk.length}  linkedin=${li.length}  demand=${demand.items.length} (${demand.queries} queries)`,
  );

  const all = [...gh, ...lv, ...ash, ...sr, ...wk, ...li, ...demand.items, ...rc, ...pe, ...tt, ...bh, ...eu, ...bz, ...pp, ...jn, ...rb];
  const upserted = await upsertJobs(all);
  await closeMissingJobs(all);
  return {
    greenhouse: gh.length,
    lever: lv.length,
    ashby: ash.length,
    smartrecruiters: sr.length,
    workable: wk.length,
    linkedin: li.length,
    demand: demand.items.length,
    demandQueries: demand.queries,
    recruitee: rc.length,
    personio: pe.length,
    teamtailor: tt.length,
    bamboohr: bh.length,
    eures: eu.length,
    breezy: bz.length,
    pinpoint: pp.length,
    join: jn.length,
    remote: rb.length,
    total: upserted,
  };
}

/**
 * Board ATS che scarichiamo per intero (API ufficiale): se un job del pool
 * con lo stesso source+sourceSlug non è più nella lista, è stato chiuso.
 * Chiudiamo solo board per cui abbiamo ricevuto almeno 1 job (evita di
 * chiudere tutto quando l'API risponde vuoto/404 per un glitch).
 */
const FULL_BOARD_SOURCES = new Set(["greenhouse", "lever", "ashby", "smartrecruiters", "workable", "recruitee", "personio", "teamtailor", "bamboohr", "breezy", "pinpoint", "join"]);
async function closeMissingJobs(items: JobListItem[]): Promise<number> {
  const seen = new Map<string, Set<string>>();
  for (const j of items) {
    if (!FULL_BOARD_SOURCES.has(j.source)) continue;
    const slug = (j as { sourceSlug?: string | null }).sourceSlug;
    if (!slug) continue;
    const key = `${j.source}::${slug}`;
    if (!seen.has(key)) seen.set(key, new Set());
    seen.get(key)!.add(j.externalId);
  }
  let closed = 0;
  for (const [key, ids] of seen) {
    const [source, sourceSlug] = key.split("::");
    try {
      const r = await prisma.job.updateMany({
        where: { source, sourceSlug, closedAt: null, externalId: { notIn: [...ids] } },
        data: { closedAt: new Date() },
      });
      closed += r.count;
    } catch (err) {
      console.warn("[sync-jobs] closeMissingJobs failed", key, err instanceof Error ? err.message : err);
    }
  }
  if (closed > 0) console.log(`[sync-jobs] chiusi ${closed} annunci non più presenti sui board`);
  return closed;
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
              closedAt: null, // ricomparso sul board → riaperto
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
