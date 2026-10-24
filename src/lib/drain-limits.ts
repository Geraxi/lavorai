/**
 * Drain-queue throughput and retry caps. Env-only, no DB or Prisma.
 * Used by claim, rollout (fresh-row attempt cap) and the cron runner.
 */

export const DEFAULT_DRAIN_QUEUE_BATCH = 5;
export const DEFAULT_DRAIN_MAX_ATTEMPTS = 3;
/** Leave this much wall time for liveness / response after the last claim. */
export const DRAIN_TIME_RESERVE_MS = 60_000;
/** Hard ceiling so a typo cannot spawn more Playwright sessions than Vercel allows. */
export const MAX_DRAIN_QUEUE_BATCH = 10;

export function maxDrainAttempts(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.DRAIN_MAX_ATTEMPTS);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : DEFAULT_DRAIN_MAX_ATTEMPTS;
}

export function drainQueueBatch(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.DRAIN_QUEUE_BATCH);
  return Number.isInteger(n) && n >= 1 && n <= MAX_DRAIN_QUEUE_BATCH ? n : DEFAULT_DRAIN_QUEUE_BATCH;
}

/** Parallel process slots: never above the claim batch, WORKER_CONCURRENCY, or 3. */
export function drainProcessConcurrency(env: Record<string, string | undefined> = process.env): number {
  const worker = Math.max(1, Number(env.WORKER_CONCURRENCY ?? 2) || 2);
  return Math.max(1, Math.min(drainQueueBatch(env), worker, 3));
}
