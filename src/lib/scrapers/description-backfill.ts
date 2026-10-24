/**
 * Re-fetch full descriptions for open jobs stored at the legacy 2,000-char cap.
 * Prioritises titles that match users' target roles. Failed fetches go into
 * exponential backoff so the same 429/timeout rows do not stall the window.
 * Per-host pacing + Retry-After. Tests inject fetch + db + sleep.
 */
import { prisma } from "@/lib/db";
import { isTestAccount } from "@/lib/admin";
import { titleMatchesAnyRole } from "@/lib/role-match";
import {
  DESCRIPTION_SOURCES,
  DESCRIPTION_TRUNCATED_LEN,
  fetchPostingDescriptionResult,
  hostFromPostingUrl,
  postingDescriptionUrl,
  type DescriptionFetchBody,
  type FetchLike,
} from "@/lib/scrapers/posting-description";

export const DESCRIPTION_BACKFILL_LIMIT = 40;
export const DESCRIPTION_BACKFILL_CONCURRENCY = 3;
export const DESCRIPTION_BACKFILL_BUDGET_MS = 25_000;
export const DESCRIPTION_HOST_GAP_MS = 600;
const BACKOFF_CAP_MS = 24 * 60 * 60 * 1000;
const BACKOFF_BASE_MS = 15 * 60 * 1000;

export type TruncatedJobRow = {
  id: string;
  source: string;
  url: string;
  externalId: string;
  sourceSlug: string | null;
  title: string;
  description: string;
  descriptionFetchAttempts?: number | null;
};

export type DescriptionBackfillDb = {
  listTruncated: (limit: number, now: Date) => Promise<TruncatedJobRow[]>;
  userRoles: () => Promise<string[]>;
  mark: (id: string, description: string, fetchedAt: Date) => Promise<void>;
  markFailure: (id: string, attempts: number, retryAt: Date) => Promise<void>;
};

export function descriptionFetchBackoffMs(attempts: number): number {
  const n = Math.max(1, Math.floor(attempts));
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (n - 1));
}

export function isDescriptionFetchDue(retryAt: Date | null | undefined, now: Date): boolean {
  return !retryAt || retryAt.getTime() <= now.getTime();
}

export function nextDescriptionFetchRetryAt(
  attempts: number,
  now: Date,
  retryAfterMs?: number,
): Date {
  const wait = Math.max(descriptionFetchBackoffMs(attempts), retryAfterMs ?? 0);
  return new Date(now.getTime() + wait);
}

export function createHostPacer(opts?: {
  minGapMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}) {
  const minGapMs = opts?.minGapMs ?? DESCRIPTION_HOST_GAP_MS;
  const sleep = opts?.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts?.now ?? Date.now;
  const lastAt = new Map<string, number>();
  const tails = new Map<string, Promise<void>>();
  return {
    async run<T>(host: string, fn: () => Promise<T>): Promise<T> {
      const key = host || "_";
      const prev = tails.get(key) ?? Promise.resolve();
      let release!: () => void;
      const gate = new Promise<void>((r) => { release = r; });
      tails.set(key, prev.then(() => gate, () => gate));
      await prev.catch(() => undefined);
      const wait = minGapMs - (now() - (lastAt.get(key) ?? 0));
      if (wait > 0) await sleep(wait);
      try {
        return await fn();
      } finally {
        lastAt.set(key, now());
        release();
      }
    },
  };
}

export function defaultDescriptionBackfillDb(): DescriptionBackfillDb {
  return {
    listTruncated: async (limit, now) => {
      const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Job"
        WHERE "closedAt" IS NULL
          AND "descriptionFetchedAt" IS NULL
          AND char_length(description) = ${DESCRIPTION_TRUNCATED_LEN}
          AND source IN ('greenhouse', 'ashby', 'lever', 'workable', 'smartrecruiters', 'breezy')
          AND ("descriptionFetchRetryAt" IS NULL OR "descriptionFetchRetryAt" <= ${now})
        ORDER BY "postedAt" DESC NULLS LAST
        LIMIT ${Math.max(1, Math.min(200, limit * 4))}`;
      if (!rows.length) return [];
      return prisma.job.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
        select: {
          id: true, source: true, url: true, externalId: true, sourceSlug: true,
          title: true, description: true, descriptionFetchAttempts: true,
        },
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
      await prisma.job.update({
        where: { id },
        data: {
          description,
          descriptionFetchedAt: fetchedAt,
          descriptionFetchRetryAt: null,
          descriptionFetchAttempts: null,
        },
      });
    },
    markFailure: async (id, attempts, retryAt) => {
      await prisma.job.update({
        where: { id },
        data: { descriptionFetchAttempts: attempts, descriptionFetchRetryAt: retryAt },
      });
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
  sleep?: (ms: number) => Promise<void>;
  minGapMs?: number;
} = {}): Promise<{ scanned: number; updated: number; marked: number; skipped: number; failed: number }> {
  const empty = { scanned: 0, updated: 0, marked: 0, skipped: 0, failed: 0 };
  const db = opts.db ?? defaultDescriptionBackfillDb();
  const limit = Math.max(0, opts.limit ?? DESCRIPTION_BACKFILL_LIMIT);
  const now = opts.now ?? new Date();
  const clock = () => (opts.now ? opts.now.getTime() : Date.now());
  const deadline = opts.deadline ?? (clock() + DESCRIPTION_BACKFILL_BUDGET_MS);
  if (!limit) return empty;
  const roles = await db.userRoles().catch(() => [] as string[]);
  const queued = prioritizeTruncatedJobs(await db.listTruncated(limit, now), roles).slice(0, limit);
  let updated = 0; let marked = 0; let skipped = 0; let failed = 0;
  const queue = [...queued];
  const bodyCache = new Map<string, Promise<DescriptionFetchBody>>();
  const hostCooldownUntil = new Map<string, number>();
  const pacer = createHostPacer({ minGapMs: opts.minGapMs ?? DESCRIPTION_HOST_GAP_MS, sleep: opts.sleep, now: clock });

  async function fail(job: TruncatedJobRow, retryAfterMs?: number) {
    const attempts = (job.descriptionFetchAttempts ?? 0) + 1;
    await db.markFailure(job.id, attempts, nextDescriptionFetchRetryAt(attempts, now, retryAfterMs));
    failed++;
  }

  async function worker() {
    for (let job = queue.shift(); job; job = queue.shift()) {
      if (clock() >= deadline) { skipped += 1 + queue.length; queue.length = 0; return; }
      const url = postingDescriptionUrl(job);
      const host = hostFromPostingUrl(url);
      const cooldown = hostCooldownUntil.get(host);
      if (cooldown && clock() < cooldown) {
        await fail(job, cooldown - clock());
        continue;
      }
      const result = await pacer.run(host, () =>
        fetchPostingDescriptionResult(job, { fetchImpl: opts.fetchImpl, timeoutMs: 8_000, bodyCache }),
      );
      if (result.ok) {
        await db.mark(job.id, result.text, now);
        marked++;
        if (result.text !== job.description) updated++;
        continue;
      }
      if (result.status === 429 && result.retryAfterMs != null && host) {
        hostCooldownUntil.set(host, Math.max(hostCooldownUntil.get(host) ?? 0, clock() + result.retryAfterMs));
      }
      await fail(job, result.retryAfterMs);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? DESCRIPTION_BACKFILL_CONCURRENCY) }, () => worker()));
  return { scanned: queued.length, updated, marked, skipped, failed };
}
