import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { isApplicationAccessPaused, isLifetimeProPlus, requiresPaymentMethodBeforeApp } from "@/lib/billing";

export const MAX_CREDIT_RETRY_BATCH = 10;
export const creditRetryRequest = z.object({
  dryRun: z.boolean().default(true),
  days: z.number().int().min(1).max(30).default(14),
  limit: z.number().int().min(1).max(200).default(100),
  cursor: z.string().min(1).max(128).optional(),
  mode: z.enum(["canary", "batch"]).default("canary"),
  applicationIds: z.array(z.string().min(1).max(128)).min(1).max(200).optional(),
  versions: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)).optional(),
  workerHealthConfirmed: z.boolean().optional(),
}).strict().superRefine((input, ctx) => {
  if (input.cursor && (!input.dryRun || input.applicationIds)) {
    ctx.addIssue({ code: "custom", message: "cursor is only for discovery previews" });
  }
  if (input.applicationIds && new Set(input.applicationIds).size !== input.applicationIds.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate applicationIds are not allowed" });
  }
  if (!input.dryRun) {
    const ids = input.applicationIds ?? [];
    const max = input.mode === "canary" ? 1 : MAX_CREDIT_RETRY_BATCH;
    if (!ids.length || ids.length > max || ids.some((id) => !input.versions?.[id]) || input.workerHealthConfirmed !== true) {
      ctx.addIssue({ code: "custom", message: `Live retries require 1-${max} exact applicationIds and their preview versions` });
    }
  }
});

/** Read-only preflight for the full-model queries at processApplication startup.
 * No user rows, credentials or migrations are read/executed. A healthy schema
 * does not prove the worker is running; live requests also require its operator
 * to confirm a fresh polling/AI-health check.
 */
export async function verifyCreditRetryWorkerSchema(db: Pick<PrismaClient, "$queryRaw">): Promise<void> {
  const fullModels = ["Application", "User", "Job", "CVDocument", "PortalSession", "UserPreferences"];
  const partialModels: Record<string, string[]> = {
    ApplicationSession: ["id", "userId", "status", "sentCount", "targetCount", "completedAt", "title", "customContext"],
    CVProfile: ["id", "userId", "linksJson"],
  };
  const models = Prisma.dmmf.datamodel.models.filter((model) => fullModels.includes(model.name) || model.name in partialModels);
  const columns = await db.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name IN (${Prisma.join(models.map((model) => model.dbName ?? model.name))})
  `;
  const available = new Set(columns.map((column) => `${column.table_name}.${column.column_name}`));
  for (const model of models) {
    for (const field of model.fields.filter((field) => field.kind !== "object"
      && (fullModels.includes(model.name) || partialModels[model.name].includes(field.name)))) {
      if (!available.has(`${model.dbName ?? model.name}.${field.dbName ?? field.name}`)) {
        throw new Error("worker_schema_not_ready");
      }
    }
  }
}

// Only known AI-provider signatures, never generic insufficient/quota/CAPTCHA.
export function isAiCreditFailure(message: string | null): boolean {
  return !!message && (/^CREDITI AI ESAURITI:/i.test(message)
    || /\bcredit balance is too low\b/i.test(message)
    || /\binsufficient_quota\b/i.test(message)
    || /you exceeded your current quota, please check your plan and billing details/i.test(message));
}

const evidenceSelect = {
  submittedAt: true, submittedVia: true, submitConfirmation: true, canaryLog: true,
  viewedAt: true, lastReplyAt: true, replyCount: true, userStatus: true,
  answersUsedJson: true, pendingQuestionsJson: true,
  cvDocxPath: true, cvPdfPath: true, coverLetterPath: true, coverLetterText: true,
} as const;

export const creditRetrySelect = {
  id: true, userId: true, jobId: true, sessionId: true, status: true,
  errorMessage: true, startedAt: true, completedAt: true, createdAt: true, retryCount: true,
  ...evidenceSelect,
  user: { select: {
    id: true, email: true, tier: true, createdAt: true, trialEndsAt: true, trialGraceEndsAt: true,
    subscriptionStatus: true, currentPeriodEnd: true, pausedUntil: true, suspendedAt: true,
    emailVerified: true, privacyConsentAt: true,
    preferences: { select: { autoApplyMode: true } },
    cvDocuments: { select: { id: true }, take: 1 },
  } },
  job: { select: { closedAt: true } },
  session: { select: { id: true, userId: true, status: true, sentCount: true, targetCount: true } },
} satisfies Prisma.ApplicationSelect;

export type CreditRetryRow = Prisma.ApplicationGetPayload<{ select: typeof creditRetrySelect }>;
type Evidence = Pick<CreditRetryRow, keyof typeof evidenceSelect>;
type Reader = Pick<Prisma.TransactionClient, "application">;
type Dependencies = {
  db: Pick<PrismaClient, "application" | "$transaction">;
  cancel: (id: string) => Promise<void>;
  enqueue: (id: string, options: { preserveClaim: true }) => Promise<void>;
};

// Anything suggesting an earlier submission/form attempt is review-only.
export function hasPriorAttemptEvidence(row: Evidence): boolean {
  return Object.entries(evidenceSelect).some(([key]) => key === "replyCount"
    ? row.replyCount !== 0 : row[key as keyof Evidence] !== null);
}

export function creditRetryVersion(row: CreditRetryRow): string {
  const { user: _user, job: _job, session: _session, ...application } = row;
  return createHash("sha256").update(JSON.stringify(application)).digest("hex");
}

export function creditRetryEligibility(row: CreditRetryRow, since: Date, now = new Date()): string | null {
  if (row.status !== "failed") return "not_failed";
  if (row.createdAt < since) return "outside_window";
  if (!isAiCreditFailure(row.errorMessage)) return "not_ai_credit_failure";
  if (!row.completedAt) return "failure_not_completed";
  if (hasPriorAttemptEvidence(row)) return "prior_attempt_evidence";
  const user = row.user;
  if (user.suspendedAt) return "user_suspended";
  if (!user.emailVerified || !user.privacyConsentAt) return "consent_or_verification_missing";
  // Historical hybrid/manual consent is not recorded on Application. Fail closed.
  if (user.preferences?.autoApplyMode !== "auto") return "auto_apply_not_enabled";
  if (!user.cvDocuments.length) return "cv_missing";
  if (user.pausedUntil && user.pausedUntil > now) return "subscription_paused";
  if (user.subscriptionStatus === "paused") return "subscription_paused";
  if (!isLifetimeProPlus(user.email) && (isApplicationAccessPaused(user)
    || requiresPaymentMethodBeforeApp(user)
    || !["active", "trialing"].includes(user.subscriptionStatus ?? "")
    || (user.currentPeriodEnd !== null && user.currentPeriodEnd <= now))) return "billing_ineligible";
  if (row.job.closedAt) return "job_closed";
  if (row.sessionId && (!row.session || row.session.userId !== row.userId
    || !["active", "auto"].includes(row.session.status))) return "session_inactive";
  return null;
}

const reservedStatuses = ["queued", "optimizing", "applying", "submitting", "awaiting_consent", "ready_to_apply", "needs_answers", "needs_session"];

async function assess(
  row: CreditRetryRow, db: Reader, since: Date, previewReservations: Map<string, number>,
): Promise<string | null> {
  const reason = creditRetryEligibility(row, since);
  if (reason) return reason;
  const siblings = await db.application.findMany({
    where: { userId: row.userId, jobId: row.jobId, id: { not: row.id } },
    select: creditRetrySelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  // Unknown states/failure causes and cancelled applications are review-only too.
  if (siblings.some((other) => other.status !== "failed" || !other.completedAt
    || !isAiCreditFailure(other.errorMessage) || hasPriorAttemptEvidence(other))) {
    return "counterpart_active_or_ambiguous";
  }
  // Stable winner across separate exact-ID requests, independent of their order.
  if (siblings.some((other) => !creditRetryEligibility(other, since)
    && (other.createdAt < row.createdAt || (+other.createdAt === +row.createdAt && other.id < row.id)))) {
    return "duplicate_user_job";
  }
  if (row.session) {
    const reserved = await db.application.count({ where: {
      sessionId: row.session.id, status: { in: reservedStatuses },
    } });
    if (row.session.sentCount + reserved + (previewReservations.get(row.session.id) ?? 0) >= row.session.targetCount) {
      return "session_capacity_reached";
    }
  }
  return null;
}

export async function retryCreditFailures(input: z.infer<typeof creditRetryRequest>, deps: Dependencies) {
  const since = new Date(Date.now() - input.days * 86_400_000);
  const where: Prisma.ApplicationWhereInput = input.applicationIds
    ? { id: { in: input.applicationIds } }
    : { status: "failed", createdAt: { gte: since }, OR: [
      { errorMessage: { startsWith: "CREDITI AI ESAURITI:", mode: "insensitive" } },
      ...["credit balance is too low", "insufficient_quota", "you exceeded your current quota, please check your plan and billing details"]
        .map((contains) => ({ errorMessage: { contains, mode: "insensitive" as const } })),
    ] };
  const rows = await deps.db.application.findMany({
    where, select: creditRetrySelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: input.applicationIds ? input.applicationIds.length : input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasMore = !input.applicationIds && rows.length > input.limit;
  const selected = hasMore ? rows.slice(0, input.limit) : rows;
  const candidates: { id: string; userId: string; jobId: string; version: string }[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const requeuedIds: string[] = [];
  const enqueueWarnings: string[] = [];
  const unknownIds: string[] = [];
  const previewReservations = new Map<string, number>();
  for (const id of input.applicationIds ?? []) {
    if (!selected.some((row) => row.id === id)) skipped.push({ id, reason: "not_found" });
  }
  for (const row of selected) {
    if (input.dryRun) {
      const reason = await assess(row, deps.db, since, previewReservations);
      if (reason) { skipped.push({ id: row.id, reason }); continue; }
      candidates.push({ id: row.id, userId: row.userId, jobId: row.jobId, version: creditRetryVersion(row) });
      if (row.sessionId) previewReservations.set(row.sessionId, (previewReservations.get(row.sessionId) ?? 0) + 1);
      continue;
    }
    try {
      const reason = await deps.db.$transaction(async (tx) => {
        // Same per-user lock primitive as trial-quota; protects sibling and round budgets.
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${row.userId}))`;
        const current = await tx.application.findUnique({ where: { id: row.id }, select: creditRetrySelect });
        if (!current) return "not_found";
        if (creditRetryVersion(current) !== input.versions?.[row.id]) return "stale_preview";
        const ineligible = await assess(current, tx, since, new Map());
        if (ineligible) return ineligible;
        const result = await tx.application.updateMany({
          where: {
            id: current.id, status: "failed", startedAt: current.startedAt,
            completedAt: current.completedAt, errorMessage: current.errorMessage, retryCount: current.retryCount,
            ...Object.fromEntries(Object.keys(evidenceSelect).map((key) => [key, key === "replyCount" ? 0 : null])),
          },
          data: { status: "queued", startedAt: null, completedAt: null, errorMessage: null },
        });
        return result.count === 1 ? null : "state_changed";
      }, { isolationLevel: "Serializable" });
      if (reason) { skipped.push({ id: row.id, reason }); continue; }
      requeuedIds.push(row.id);
      // Never roll back to failed after publication: the DB poller may have claimed it.
      try {
        await deps.cancel(row.id);
        await deps.enqueue(row.id, { preserveClaim: true });
      } catch {
        enqueueWarnings.push(row.id); // It stays queued for the existing DB poller.
      }
    } catch {
      // Serialization conflicts and uncertain commits are not automatically retried.
      unknownIds.push(row.id);
    }
  }
  return { ok: unknownIds.length === 0, dryRun: input.dryRun, mode: input.mode, days: input.days,
    found: selected.length, hasMore, nextCursor: hasMore ? selected[selected.length - 1].id : null, candidates, skipped,
    requeued: requeuedIds.length, requeuedIds, enqueueWarnings, unknownIds };
}
