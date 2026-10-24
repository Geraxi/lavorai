import { resolveAdapterByUrl } from "@/lib/ats-adapter-resolution";
import { hasPotentialSubmission } from "@/lib/application-worker-gates";
import type { JobLivenessResult } from "@/lib/job-liveness";

/**
 * Selezione + riaccodamento sicuro e idempotente delle candidature bloccate:
 *  (a) ready_to_apply con "Portale non supportato" ma URL su ATS supportato
 *  (b) failed per Claude `not_found_error` (nome modello obsoleto)
 * Requisiti: URL con adapter, job aperto (closedAt null + liveness "live"),
 * nessuna evidenza di invio. Il riaccodamento è compare-and-set sullo stato
 * letto: rieseguire lo script non riaccoda due volte la stessa riga.
 */

export const UNSUPPORTED_PORTAL_PATTERN = "non è supportato per invio automatico";
export const MODEL_NOT_FOUND_PATTERN = "not_found_error";

export const stuckAtsSelect = {
  id: true, userId: true, jobId: true, status: true, errorMessage: true, portal: true, startedAt: true,
  submittedAt: true, submittedVia: true, submitConfirmation: true, canaryLog: true,
  answersUsedJson: true, viewedAt: true, lastReplyAt: true, replyCount: true, userStatus: true,
  submitStartedAt: true,
  job: { select: { id: true, url: true, closedAt: true } },
} as const;

export type StuckAtsRow = {
  id: string; userId: string; jobId: string; status: string; errorMessage: string | null; portal: string;
  startedAt: Date | null;
  submittedAt: Date | null; submittedVia: string | null; submitConfirmation: string | null; canaryLog: string | null;
  answersUsedJson: string | null; viewedAt: Date | null; lastReplyAt: Date | null; replyCount: number; userStatus: string | null;
  submitStartedAt?: Date | null;
  job: { id: string; url: string; closedAt: Date | null };
};

export function stuckAtsCandidateWhere() {
  return {
    OR: [
      { status: "ready_to_apply", errorMessage: { contains: UNSUPPORTED_PORTAL_PATTERN } },
      { status: "failed", errorMessage: { contains: MODEL_NOT_FOUND_PATTERN } },
    ],
    submittedAt: null,
    job: { closedAt: null },
  };
}

export type SkipReason = "no_adapter" | "job_closed" | "possible_submission" | "already_submitted_sibling";
export type StuckKind = "unsupported_portal" | "model_not_found";

export function classifyStuck(row: StuckAtsRow): StuckKind | null {
  const msg = row.errorMessage ?? "";
  if (row.status === "ready_to_apply" && msg.includes(UNSUPPORTED_PORTAL_PATTERN)) return "unsupported_portal";
  if (row.status === "failed" && msg.includes(MODEL_NOT_FOUND_PATTERN)) return "model_not_found";
  return null;
}

/** Filtri statici (senza rete). */
export function staticSkipReason(row: StuckAtsRow): SkipReason | "not_stuck" | null {
  if (!classifyStuck(row)) return "not_stuck";
  if (row.job.closedAt) return "job_closed";
  if (hasPotentialSubmission(row)) return "possible_submission";
  if (!resolveAdapterByUrl([row.job.url])) return "no_adapter";
  return null;
}

export interface RequeueDeps {
  findCandidates(take: number): Promise<StuckAtsRow[]>;
  /** true se esiste un'altra application dello stesso user+job con evidenza di invio. */
  hasSubmittedSibling(row: StuckAtsRow): Promise<boolean>;
  checkLiveness(url: string): Promise<JobLivenessResult>;
  markJobClosed(jobId: string): Promise<void>;
  /** CAS: aggiorna solo se status/errorMessage sono ancora quelli letti. Ritorna righe aggiornate. */
  requeue(row: StuckAtsRow): Promise<number>;
  enqueue(id: string): Promise<void>;
  log?(line: string): void;
}

export interface RequeueReport {
  mode: "dry-run" | "apply";
  scanned: number;
  byKind: Record<StuckKind, number>;
  byAdapter: Record<string, number>;
  skipped: Record<string, number>;
  liveness: { live: number; closed: number; unknown: number };
  eligible: number;
  requeued: number;
  raced: number;
  eligibleIds: string[];
}

export async function runStuckAtsRequeue(deps: RequeueDeps, opts: { apply: boolean; limit: number }): Promise<RequeueReport> {
  const report: RequeueReport = {
    mode: opts.apply ? "apply" : "dry-run", scanned: 0,
    byKind: { unsupported_portal: 0, model_not_found: 0 }, byAdapter: {}, skipped: {},
    liveness: { live: 0, closed: 0, unknown: 0 }, eligible: 0, requeued: 0, raced: 0, eligibleIds: [],
  };
  const skip = (r: string) => { report.skipped[r] = (report.skipped[r] ?? 0) + 1; };
  // Scansiona più righe del limite: molte vengono scartate dai filtri.
  const rows = await deps.findCandidates(Math.min(opts.limit * 5, 5000));
  const livenessCache = new Map<string, JobLivenessResult>();
  for (const row of rows) {
    if (report.eligible >= opts.limit) break;
    report.scanned++;
    const reason = staticSkipReason(row);
    if (reason) { skip(reason); continue; }
    if (await deps.hasSubmittedSibling(row)) { skip("already_submitted_sibling"); continue; }
    let live = livenessCache.get(row.job.id);
    if (!live) { live = await deps.checkLiveness(row.job.url); livenessCache.set(row.job.id, live); report.liveness[live.state]++; }
    if (live.state === "closed") {
      if (opts.apply) await deps.markJobClosed(row.job.id);
      skip("liveness_closed"); continue;
    }
    if (live.state !== "live") { skip("liveness_unknown"); continue; }
    const kind = classifyStuck(row)!;
    const adapter = resolveAdapterByUrl([row.job.url])!.adapter.id;
    report.byKind[kind]++;
    report.byAdapter[adapter] = (report.byAdapter[adapter] ?? 0) + 1;
    report.eligible++;
    report.eligibleIds.push(row.id);
    if (!opts.apply) continue;
    const n = await deps.requeue(row);
    if (n !== 1) { report.raced++; continue; }
    await deps.enqueue(row.id);
    report.requeued++;
    deps.log?.(`requeued ${row.id} (${kind}, ${adapter})`);
  }
  return report;
}
