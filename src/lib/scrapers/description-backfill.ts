/**
 * Re-fetch full descriptions for open jobs stored at the legacy 2,000-char cap.
 * Prioritises titles that match users' target roles. Rate-limited and
 * idempotent (descriptionFetchedAt). Tests inject fetch + db.
 */
import { prisma } from "@/lib/db";
import { isTestAccount } from "@/lib/admin";
import { titleMatchesAnyRole } from "@/lib/role-match";
import {
  DESCRIPTION_SOURCES,
  DESCRIPTION_TRUNCATED_LEN,
  fetchPostingDescription,
  type FetchLike,
} from "@/lib/scrapers/posting-description";

export const DESCRIPTION_BACKFILL_LIMIT = 40;
export const DESCRIPTION_BACKFILL_CONCURRENCY = 3;
export const DESCRIPTION_BACKFILL_BUDGET_MS = 25_000;

export type TruncatedJobRow = {
  id: string;
  source: string;
  url: string;
  externalId: string;
  sourceSlug: string | null;
  title: string;
  description: string;
};

export type DescriptionBackfillDb = {
  listTruncated: (limit: number) => Promise<TruncatedJobRow[]>;
  userRoles: () => Promise<string[]>;
  mark: (id: string, description: string, fetchedAt: Date) => Promise<void>;
};

export function defaultDescriptionBackfillDb(): DescriptionBackfillDb {
  return {
    listTruncated: async (limit) => {
      const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Job"
        WHERE "closedAt" IS NULL
          AND "descriptionFetchedAt" IS NULL
          AND char_length(description) = ${DESCRIPTION_TRUNCATED_LEN}
          AND source IN ('greenhouse', 'ashby', 'lever', 'workable', 'smartrecruiters', 'breezy')
        ORDER BY "postedAt" DESC NULLS LAST
        LIMIT ${Math.max(1, Math.min(200, limit * 4))}`;
      if (!rows.length) return [];
      return prisma.job.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
        select: { id: true, source: true, url: true, externalId: true, sourceSlug: true, title: true, description: true },
      });
    },
    userRoles: async () => {
      const prefs = await prisma.userPreferences.findMany({
        select: { rolesJson: true, user: { select: { email: true } } },
        take: 120,
      });
      const roles = new Set<string>();
      for (const p of prefs) {
        if (isTestAccount(p.user.email)) continue;
        try {
          const parsed = JSON.parse(p.rolesJson) as unknown;
          if (Array.isArray(parsed)) for (const r of parsed) if (typeof r === "string" && r.trim()) roles.add(r.trim());
        } catch { /* ignore */ }
      }
      return [...roles];
    },
    mark: async (id, description, fetchedAt) => {
      await prisma.job.update({ where: { id }, data: { description, descriptionFetchedAt: fetchedAt } });
    },
  };
}

export function prioritizeTruncatedJobs(jobs: TruncatedJobRow[], roles: string[]): TruncatedJobRow[] {
  const supported = jobs.filter((j) => DESCRIPTION_SOURCES.has(j.source));
  if (!roles.length) return supported;
  const matched: TruncatedJobRow[] = [];
  const rest: TruncatedJobRow[] = [];
  for (const j of supported) (titleMatchesAnyRole(j.title, roles) ? matched : rest).push(j);
  return [...matched, ...rest];
}

export async function backfillTruncatedDescriptions(opts: {
  db?: DescriptionBackfillDb;
  fetchImpl?: FetchLike;
  limit?: number;
  concurrency?: number;
  deadline?: number;
  now?: Date;
} = {}): Promise<{ scanned: number; updated: number; marked: number; skipped: number }> {
  const db = opts.db ?? defaultDescriptionBackfillDb();
  const limit = Math.max(0, opts.limit ?? DESCRIPTION_BACKFILL_LIMIT);
  const now = opts.now ?? new Date();
  const deadline = opts.deadline ?? (Date.now() + DESCRIPTION_BACKFILL_BUDGET_MS);
  if (!limit) return { scanned: 0, updated: 0, marked: 0, skipped: 0 };
  const roles = await db.userRoles().catch(() => [] as string[]);
  const queued = prioritizeTruncatedJobs(await db.listTruncated(limit), roles).slice(0, limit);
  let updated = 0; let marked = 0; let skipped = 0;
  const queue = [...queued];
  const bodyCache = new Map<string, Promise<string | null>>();
  async function worker() {
    for (let job = queue.shift(); job; job = queue.shift()) {
      if (Date.now() >= deadline) { skipped += 1 + queue.length; queue.length = 0; return; }
      const text = await fetchPostingDescription(job, { fetchImpl: opts.fetchImpl, timeoutMs: 8_000, bodyCache });
      if (!text) { skipped++; continue; }
      await db.mark(job.id, text, now);
      marked++;
      if (text !== job.description) updated++;
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? DESCRIPTION_BACKFILL_CONCURRENCY) }, () => worker()));
  return { scanned: queued.length, updated, marked, skipped };
}
