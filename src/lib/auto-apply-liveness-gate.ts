import type { JobLivenessResult } from "@/lib/job-liveness";

/** Pre-queue liveness gate for auto-apply producers.
 *
 * Only conclusive "closed" evidence blocks a job (and marks it closed so no
 * other user queues it). "unknown", timeouts, errors and checks beyond the
 * per-run cap are admitted unchanged: the worker re-checks liveness before any
 * submission and holds unverifiable postings, so this gate can never send more
 * than before; it only stops creating applications for dead postings.
 */
export type LivenessVerdict = "live" | "closed" | "unchecked";
export type LivenessGateDeps = {
  check: (url: string) => Promise<Pick<JobLivenessResult, "state" | "reason">>;
  markClosed: (jobId: string) => Promise<void>;
  maxChecks?: number;
  timeoutMs?: number;
};
export type LivenessGate = {
  verdict: (job: { id: string; url: string }) => Promise<LivenessVerdict>;
  stats: () => { checked: number; closed: number; unchecked: number };
};

export const DEFAULT_LIVENESS_MAX_CHECKS = 40;
export const DEFAULT_LIVENESS_TIMEOUT_MS = 10_000;

export function livenessMaxChecksFromEnv(raw = process.env.AUTO_APPLY_LIVENESS_MAX_CHECKS): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_LIVENESS_MAX_CHECKS;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 500 ? n : DEFAULT_LIVENESS_MAX_CHECKS;
}

export function createLivenessGate(deps: LivenessGateDeps): LivenessGate {
  const maxChecks = deps.maxChecks ?? DEFAULT_LIVENESS_MAX_CHECKS;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_LIVENESS_TIMEOUT_MS;
  const cache = new Map<string, Promise<LivenessVerdict>>();
  let checked = 0, closed = 0, unchecked = 0;
  const run = async (job: { id: string; url: string }): Promise<LivenessVerdict> => {
    if (checked >= maxChecks) { unchecked++; return "unchecked"; }
    checked++;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        deps.check(job.url),
        new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); }),
      ]);
      if (result?.state === "closed") {
        closed++;
        await deps.markClosed(job.id).catch(() => void 0);
        return "closed";
      }
      if (result?.state === "live") return "live";
      unchecked++;
      return "unchecked";
    } catch {
      unchecked++;
      return "unchecked";
    } finally { if (timer) clearTimeout(timer); }
  };
  return {
    verdict(job) {
      // One check per job per run, shared across users.
      let pending = cache.get(job.id);
      if (!pending) { pending = run(job); cache.set(job.id, pending); }
      return pending;
    },
    stats: () => ({ checked, closed, unchecked }),
  };
}
