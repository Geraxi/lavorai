/**
 * Reliability + product metrics for /admin/reliability.
 *
 * Every number is computed from first-party rows; nothing is inferred.
 * Internal/test accounts are excluded with the single isTestAccount() helper.
 * The pure `computeReliabilityMetrics` is unit-tested; `loadReliabilityMetrics`
 * only gathers rows (admin-only, aggregates out, no CV/email bodies).
 */
import { prisma } from "@/lib/db";
import { isAdmin, isTestAccount } from "@/lib/admin";
import { deriveApplicationLifecycle, lifecycleSelect, type LifecycleInput, type LifecycleStatus } from "@/lib/application-lifecycle";

const DAY = 86_400_000;

export interface MetricsUser {
  id: string; email: string; createdAt: Date; lastLoginAt: Date | null;
  tier: string; subscriptionStatus: string | null; cancelAtPeriodEnd: boolean;
  hasCv: boolean; preferencesConfirmed: boolean;
}
export interface MetricsApplication extends LifecycleInput { id: string; userId: string; createdAt: Date; portal?: string | null; channel?: string | null }
export interface MetricsInput {
  now: Date; since: Date; until: Date;
  users: MetricsUser[];
  /** All applications of cohort users (for activation/TTFUA) ∪ applications created in the window (delivery). */
  applications: MetricsApplication[];
  /** Latest authenticated page view per user (PageView.userId). */
  lastSeenByUser: Map<string, Date>;
  purchasedUserIds: Set<string>;
  cancelEvents: Array<{ userId: string; createdAt: Date }>;
  /** Application ids with an evidence-backed human reply, and the subset classified as interview. */
  repliedApplicationIds: Set<string>;
  interviewApplicationIds: Set<string>;
  aiUsage: { available: boolean; rows: Array<{ model: string; inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null; applicationId: string | null }> };
  /** USD per 1M tokens by model, from env. Missing model → cost unknown. */
  pricing: Record<string, { input: number; output: number; cachedInput?: number }>;
}

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const rate = (num: number, den: number): number | null => (den ? num / den : null);
const evidenceTime = (app: MetricsApplication, lifecycleAt: string | null): Date => (lifecycleAt ? new Date(lifecycleAt) : app.submittedAt ?? app.completedAt ?? app.createdAt);
const prepared = (app: MetricsApplication) => !!(app.cvDocxPath || app.cvPdfPath || app.coverLetterPath || app.coverLetterText);

export function parsePricing(raw: string | undefined): MetricsInput["pricing"] {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, { input?: unknown; output?: unknown; cachedInput?: unknown }>;
    const out: MetricsInput["pricing"] = {};
    for (const [model, p] of Object.entries(parsed ?? {})) {
      if (typeof p?.input === "number" && typeof p?.output === "number") out[model] = { input: p.input, output: p.output, ...(typeof p.cachedInput === "number" ? { cachedInput: p.cachedInput } : {}) };
    }
    return out;
  } catch { return {}; }
}

export function computeReliabilityMetrics(input: MetricsInput) {
  const users = input.users.filter((u) => !isTestAccount(u.email));
  const realIds = new Set(users.map((u) => u.id));
  const cohort = users.filter((u) => u.createdAt >= input.since && u.createdAt <= input.until);
  const apps = input.applications.filter((a) => realIds.has(a.userId));
  const derived = apps.map((app) => ({ app, lifecycle: deriveApplicationLifecycle(app) })).filter(({ lifecycle }) => !lifecycle.excludedFromMetrics);
  const byUser = new Map<string, typeof derived>();
  for (const row of derived) { const list = byUser.get(row.app.userId) ?? []; list.push(row); byUser.set(row.app.userId, list); }

  // ── activation: CV uploaded + preferences confirmed + first application prepared
  const activationSteps = cohort.map((u) => {
    const own = byUser.get(u.id) ?? [];
    return { cv: u.hasCv, preferences: u.preferencesConfirmed, prepared: own.some(({ app }) => prepared(app)) };
  });
  const activated = activationSteps.filter((s) => s.cv && s.preferences && s.prepared).length;

  // ── time to first useful application (signup → first confirmed_submitted evidence)
  const ttfua: number[] = [];
  const ttfPrepared: number[] = [];
  for (const u of cohort) {
    const own = byUser.get(u.id) ?? [];
    const confirmedAt = own.filter(({ lifecycle }) => lifecycle.status === "confirmed_submitted").map(({ app, lifecycle }) => +evidenceTime(app, lifecycle.evidence.at));
    if (confirmedAt.length) ttfua.push((Math.min(...confirmedAt) - +u.createdAt) / 3_600_000);
    const preparedAt = own.filter(({ app }) => prepared(app)).map(({ app }) => +app.createdAt);
    if (preparedAt.length) ttfPrepared.push((Math.min(...preparedAt) - +u.createdAt) / 3_600_000);
  }

  // ── delivery outcomes of applications CREATED in the window
  const windowRows = derived.filter(({ app }) => app.createdAt >= input.since && app.createdAt <= input.until);
  const counts = Object.fromEntries(["draft", "approved", "submitting", "confirmed_submitted", "submitted_unverified", "failed", "needs_manual"].map((k) => [k, 0])) as Record<LifecycleStatus, number>;
  const failureReasons = new Map<string, number>();
  const manualReasons = new Map<string, number>();
  const byChannel = new Map<string, { confirmed: number; unverified: number; failed: number }>();
  for (const { app, lifecycle } of windowRows) {
    counts[lifecycle.status]++;
    if (lifecycle.failureReason) failureReasons.set(lifecycle.failureReason, (failureReasons.get(lifecycle.failureReason) ?? 0) + 1);
    if (lifecycle.manualReason) manualReasons.set(lifecycle.manualReason, (manualReasons.get(lifecycle.manualReason) ?? 0) + 1);
    if (["confirmed_submitted", "submitted_unverified", "failed"].includes(lifecycle.status)) {
      const channel = lifecycle.evidence.ats ?? app.channel ?? app.job?.source ?? app.portal ?? "unknown";
      const row = byChannel.get(channel) ?? { confirmed: 0, unverified: 0, failed: 0 };
      if (lifecycle.status === "confirmed_submitted") row.confirmed++; else if (lifecycle.status === "submitted_unverified") row.unverified++; else row.failed++;
      byChannel.set(channel, row);
    }
  }
  const outcomes = counts.confirmed_submitted + counts.submitted_unverified + counts.failed;

  // ── return usage (cohort old enough): any authenticated activity on/after day N
  const lastActive = (u: MetricsUser) => {
    const seen = input.lastSeenByUser.get(u.id);
    const login = u.lastLoginAt;
    return seen && login ? (seen > login ? seen : login) : seen ?? login ?? null;
  };
  const retention = (days: number) => {
    const eligible = cohort.filter((u) => +u.createdAt + days * DAY <= +input.now);
    const returned = eligible.filter((u) => { const at = lastActive(u); return !!at && +at >= +u.createdAt + days * DAY; }).length;
    return { eligible: eligible.length, returned, rate: rate(returned, eligible.length) };
  };

  // ── monetization
  const paidNow = (u: MetricsUser) => ["pro", "pro_plus"].includes(u.tier) && u.subscriptionStatus === "active";
  const cohortPaid = cohort.filter((u) => paidNow(u) || input.purchasedUserIds.has(u.id)).length;
  const cancelUsers = new Set(input.cancelEvents.filter((e) => realIds.has(e.userId) && e.createdAt >= input.since && e.createdAt <= input.until).map((e) => e.userId));
  const pendingCancellation = users.filter((u) => u.cancelAtPeriodEnd && u.subscriptionStatus === "active").length;

  // ── replies/interviews (evidence-backed only), among outcomes in the window
  const sentIds = new Set(windowRows.filter(({ lifecycle }) => ["confirmed_submitted", "submitted_unverified"].includes(lifecycle.status)).map(({ app }) => app.id));
  const replied = [...input.repliedApplicationIds].filter((id) => sentIds.has(id)).length;
  const interviews = [...input.interviewApplicationIds].filter((id) => sentIds.has(id)).length;

  // ── AI cost per completed application (tokens real; USD only if priced)
  const confirmedIds = new Set(windowRows.filter(({ lifecycle }) => lifecycle.status === "confirmed_submitted").map(({ app }) => app.id));
  const realAppIds = new Set(apps.map((a) => a.id));
  let inputTokens = 0, outputTokens = 0, linkedTokens = 0, usd = 0, unpricedCalls = 0, linkedUsd = 0;
  for (const row of input.aiUsage.rows) {
    const tokens = (row.inputTokens ?? 0) + (row.outputTokens ?? 0);
    inputTokens += row.inputTokens ?? 0; outputTokens += row.outputTokens ?? 0;
    const price = input.pricing[row.model];
    let cost = 0;
    if (price) {
      const cached = Math.min(row.cachedInputTokens ?? 0, row.inputTokens ?? 0);
      cost = (((row.inputTokens ?? 0) - cached) * price.input + cached * (price.cachedInput ?? price.input) + (row.outputTokens ?? 0) * price.output) / 1_000_000;
      usd += cost;
    } else unpricedCalls++;
    if (row.applicationId && realAppIds.has(row.applicationId)) { linkedTokens += tokens; linkedUsd += cost; }
  }

  return {
    window: { since: input.since, until: input.until },
    cohort: { signups: cohort.length },
    activation: {
      cvUploaded: activationSteps.filter((s) => s.cv).length,
      preferencesConfirmed: activationSteps.filter((s) => s.preferences).length,
      firstApplicationPrepared: activationSteps.filter((s) => s.prepared).length,
      activated, rate: rate(activated, cohort.length),
    },
    timeToFirstUseful: { users: ttfua.length, medianHours: median(ttfua), medianHoursToFirstPrepared: median(ttfPrepared) },
    delivery: {
      created: windowRows.length, byStatus: counts, outcomes,
      confirmedRate: rate(counts.confirmed_submitted, outcomes), unverifiedRate: rate(counts.submitted_unverified, outcomes), failedRate: rate(counts.failed, outcomes),
      failureReasons: [...failureReasons.entries()].sort((a, b) => b[1] - a[1]),
      manualReasons: [...manualReasons.entries()].sort((a, b) => b[1] - a[1]),
      byChannel: [...byChannel.entries()].sort((a, b) => (b[1].confirmed + b[1].unverified + b[1].failed) - (a[1].confirmed + a[1].unverified + a[1].failed)),
    },
    retention: { d7: retention(7), d30: retention(30) },
    monetization: { cohortPaid, paidConversionRate: rate(cohortPaid, cohort.length), payingNow: users.filter(paidNow).length, cancellations: cancelUsers.size, pendingCancellation },
    outcomes: { sent: sentIds.size, replied, interviews, replyRate: rate(replied, sentIds.size) },
    aiCost: {
      available: input.aiUsage.available, calls: input.aiUsage.rows.length, inputTokens, outputTokens, unpricedCalls,
      estimatedUsd: unpricedCalls === input.aiUsage.rows.length ? null : usd,
      pricedFully: input.aiUsage.rows.length > 0 && unpricedCalls === 0,
      completedApplications: confirmedIds.size,
      tokensPerCompleted: confirmedIds.size ? linkedTokens / confirmedIds.size : null,
      estimatedUsdPerCompleted: confirmedIds.size && unpricedCalls === 0 && input.aiUsage.rows.length ? linkedUsd / confirmedIds.size : null,
    },
  };
}
export type ReliabilityMetrics = ReturnType<typeof computeReliabilityMetrics>;

function parseRoles(json: string | null | undefined): boolean {
  try { const roles = JSON.parse(json ?? "[]"); return Array.isArray(roles) && roles.some((r) => typeof r === "string" && !!r.trim()); } catch { return false; }
}

/** Admin-only loader. Bounded by the window; no CV/email/letter bodies are read. */
export async function loadReliabilityMetrics(viewerEmail: string | null | undefined, days: number, now = new Date()): Promise<ReliabilityMetrics> {
  if (!isAdmin(viewerEmail)) throw new Error("Admin required");
  const since = new Date(+now - days * DAY);
  const rawUsers = await prisma.user.findMany({ select: {
    id: true, email: true, createdAt: true, lastLoginAt: true, tier: true, subscriptionStatus: true, cancelAtPeriodEnd: true,
    cvProfile: { select: { id: true } }, _count: { select: { cvDocuments: true } }, preferences: { select: { rolesJson: true } },
  } });
  const users: MetricsUser[] = rawUsers.filter((u) => !isTestAccount(u.email)).map((u) => ({
    id: u.id, email: u.email, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, tier: u.tier, subscriptionStatus: u.subscriptionStatus,
    cancelAtPeriodEnd: u.cancelAtPeriodEnd, hasCv: u._count.cvDocuments > 0 || !!u.cvProfile, preferencesConfirmed: parseRoles(u.preferences?.rolesJson),
  }));
  const realIds = users.map((u) => u.id);
  const cohortIds = users.filter((u) => u.createdAt >= since && u.createdAt <= now).map((u) => u.id);
  const select = { ...lifecycleSelect, userId: true, portal: true } as const;
  const [cohortApps, windowApps, views, purchases, cancels, replies, gmail, usage] = await Promise.all([
    prisma.application.findMany({ where: { userId: { in: cohortIds }, status: { not: "diagnostic" } }, select }),
    prisma.application.findMany({ where: { userId: { in: realIds }, createdAt: { gte: since, lte: now }, status: { not: "diagnostic" } }, select }),
    prisma.pageView.groupBy({ by: ["userId"], where: { userId: { in: cohortIds } }, _max: { ts: true } }).catch(() => []),
    prisma.conversionEvent.findMany({ where: { name: "purchase_completed", userId: { in: cohortIds } }, select: { userId: true } }).catch(() => []),
    prisma.subscriptionEvent.findMany({ where: { action: "cancel", createdAt: { gte: since, lte: now } }, select: { userId: true, createdAt: true } }).catch(() => []),
    prisma.applicationReply.findMany({ where: { isHuman: true, isSecurityCode: false, kind: { in: ["risposta", "colloquio", "rifiutata"] }, application: { userId: { in: realIds }, createdAt: { gte: since, lte: now } } }, select: { applicationId: true, kind: true } }),
    prisma.gmailMessage.findMany({ where: { isHuman: true, kind: { in: ["risposta", "colloquio", "rifiutata"] }, applicationId: { not: null }, application: { userId: { in: realIds }, createdAt: { gte: since, lte: now } } }, select: { applicationId: true, kind: true } }).catch(() => []),
    prisma.aiUsageEvent.findMany({ where: { createdAt: { gte: since, lte: now } }, select: { model: true, inputTokens: true, outputTokens: true, cachedInputTokens: true, applicationId: true } })
      .then((rows) => ({ available: true, rows })).catch(() => ({ available: false, rows: [] })),
  ]);
  const seen = new Map<string, MetricsApplication>();
  for (const app of [...cohortApps, ...windowApps]) seen.set(app.id, app as MetricsApplication);
  const evidenceRows = [...replies, ...gmail].filter((r): r is { applicationId: string; kind: string } => !!r.applicationId);
  return computeReliabilityMetrics({
    now, since, until: now, users, applications: [...seen.values()],
    lastSeenByUser: new Map(views.filter((v) => v.userId && v._max.ts).map((v) => [v.userId as string, v._max.ts as Date])),
    purchasedUserIds: new Set(purchases.map((p) => p.userId).filter((id): id is string => !!id)),
    cancelEvents: cancels,
    repliedApplicationIds: new Set(evidenceRows.map((r) => r.applicationId)),
    interviewApplicationIds: new Set(evidenceRows.filter((r) => r.kind === "colloquio").map((r) => r.applicationId)),
    aiUsage: usage, pricing: parsePricing(process.env.AI_PRICING_USD_PER_MTOK),
  });
}
