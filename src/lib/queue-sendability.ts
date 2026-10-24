import { dailyApplicationLimit, FREE_QUOTA_WORKER_INFLIGHT_STATUSES, freeQuotaWindowStart, freeWeeklyApplyQuota, hasPaidOrTrialApplicationAccess, usesFreeWeeklyQuota } from "@/lib/billing";
import { maxDrainAttempts } from "@/lib/drain-limits";

export const HELD_MESSAGE_PREFIX = "Invio in attesa:";
export const MAX_ATTEMPTS_MESSAGE_PREFIX = "Invio interrotto dopo";

export const CLAIM_HOLD_REASONS = [
  "privacy_consent_missing",
  "email_verification_missing",
  "consent_or_verification_missing",
  "user_suspended",
  "auto_apply_not_enabled",
  "subscription_paused",
  "billing_ineligible",
  "free_weekly_quota_reached",
  "daily_quota_reached",
] as const;
export type ClaimHoldReason = (typeof CLAIM_HOLD_REASONS)[number];

export type SendabilityUser = {
  suspendedAt?: Date | null;
  privacyConsentAt?: Date | null;
  emailVerified?: Date | null;
  subscriptionStatus?: string | null;
  pausedUntil?: Date | null;
  tier?: string | null;
  email?: string | null;
  createdAt?: Date | string;
  trialEndsAt?: Date | string | null;
  trialGraceEndsAt?: Date | string | null;
  currentPeriodEnd?: Date | null;
  preferences?: { autoApplyMode?: string | null } | null;
};

export const claimUserSelect = {
  tier: true, email: true, subscriptionStatus: true, createdAt: true, trialEndsAt: true,
  trialGraceEndsAt: true, currentPeriodEnd: true, pausedUntil: true, suspendedAt: true,
  emailVerified: true, privacyConsentAt: true,
  preferences: { select: { autoApplyMode: true } },
} as const;

/** Account-level block that makes a queued row unsendable right now. Missing user = unknown, leave to the worker. */
export function queuedUserBlockReason(
  user: SendabilityUser | null | undefined,
  consentGrantedAt: Date | null,
  now = new Date(),
): ClaimHoldReason | null {
  if (!user) return null;
  if (user.suspendedAt) return "user_suspended";
  if (!user.privacyConsentAt) return "privacy_consent_missing";
  if (!user.emailVerified) return "email_verification_missing";
  const mode = user.preferences?.autoApplyMode;
  if (mode === "off" || !mode || (mode !== "auto" && !(["manual", "hybrid"].includes(mode) && consentGrantedAt))) {
    return "auto_apply_not_enabled";
  }
  if (user.subscriptionStatus === "paused" || (user.pausedUntil && user.pausedUntil > now)) return "subscription_paused";
  if (!hasPaidOrTrialApplicationAccess(user, now) && !usesFreeWeeklyQuota(user, now)) return "billing_ineligible";
  return null;
}

export function weeklyQuotaBlockReason(
  user: SendabilityUser | null | undefined,
  usedInWindow: number,
  now = new Date(),
): ClaimHoldReason | null {
  if (!user || !usesFreeWeeklyQuota(user, now)) return null;
  return usedInWindow >= freeWeeklyApplyQuota() ? "free_weekly_quota_reached" : null;
}

export function dailyQuotaBlockReason(
  user: SendabilityUser | null | undefined,
  usedToday: number,
  now = new Date(),
): ClaimHoldReason | null {
  if (!user || usesFreeWeeklyQuota(user, now)) return null;
  const cap = dailyApplicationLimit(user);
  if (!Number.isFinite(cap) || cap <= 0) return null;
  return usedToday >= cap ? "daily_quota_reached" : null;
}

export type ClaimableRow = {
  id: string;
  userId?: string;
  createdAt: Date;
  consentGrantedAt: Date | null;
  retryCount?: number;
  user?: SendabilityUser | null;
  job?: { url?: string; recruiterEmail?: string | null } | null;
};

export function claimBlockReason(
  row: ClaimableRow,
  usage: { weekly: number; daily: number },
  now = new Date(),
): ClaimHoldReason | "max_attempts" | null {
  if ((row.retryCount ?? 0) >= maxDrainAttempts()) return "max_attempts";
  return queuedUserBlockReason(row.user, row.consentGrantedAt, now)
    ?? weeklyQuotaBlockReason(row.user, usage.weekly, now)
    ?? dailyQuotaBlockReason(row.user, usage.daily, now);
}

export function isQueuedRowSendable(
  row: ClaimableRow,
  usage: { weekly: number; daily: number } = { weekly: 0, daily: 0 },
  now = new Date(),
): boolean {
  return claimBlockReason(row, usage, now) === null;
}

export type QuotaUsageMaps = {
  weekly: Map<string, number>;
  daily: Map<string, number>;
};

export function usageFor(maps: QuotaUsageMaps, userId: string | undefined): { weekly: number; daily: number } {
  if (!userId) return { weekly: 0, daily: 0 };
  return { weekly: maps.weekly.get(userId) ?? 0, daily: maps.daily.get(userId) ?? 0 };
}

/** Prisma filter shared by claim and park: a row that consumed quota this window. */
export function quotaUsageWhere(userIds: string[], excludeIds: string[], now: Date) {
  const weekStart = freeQuotaWindowStart(now);
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  return {
    userId: { in: userIds },
    ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
    OR: [
      { status: "success" as const, OR: [
        { submittedAt: { gte: weekStart } },
        { submittedAt: null, createdAt: { gte: weekStart } },
      ] },
      { status: { in: [...FREE_QUOTA_WORKER_INFLIGHT_STATUSES] } },
    ],
  };
}

export function countsTowardWeekly(row: { status: string; submittedAt?: Date | null; createdAt?: Date }, now: Date): boolean {
  if (FREE_QUOTA_WORKER_INFLIGHT_STATUSES.includes(row.status)) return true;
  if (row.status !== "success") return false;
  const start = +freeQuotaWindowStart(now);
  const when = +(row.submittedAt ?? row.createdAt ?? 0);
  return when >= start;
}

export function countsTowardDaily(row: { status: string; submittedAt?: Date | null; createdAt?: Date }, now: Date): boolean {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  if (FREE_QUOTA_WORKER_INFLIGHT_STATUSES.includes(row.status)) {
    return +(row.createdAt ?? 0) >= +dayStart || +(row.submittedAt ?? 0) >= +dayStart;
  }
  if (row.status !== "success") return false;
  return +(row.submittedAt ?? row.createdAt ?? 0) >= +dayStart;
}

export async function loadQuotaUsageMaps(
  db: { application: { findMany: (args?: any) => Promise<any[]> } },
  userIds: string[],
  excludeIds: string[],
  now: Date,
): Promise<QuotaUsageMaps> {
  const maps: QuotaUsageMaps = { weekly: new Map(), daily: new Map() };
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return maps;
  const used: Array<{ userId: string; status: string; submittedAt: Date | null; createdAt: Date }> = await db.application.findMany({
    where: quotaUsageWhere(unique, excludeIds, now),
    select: { userId: true, status: true, submittedAt: true, createdAt: true },
  });
  for (const row of used) {
    if (countsTowardWeekly(row, now)) maps.weekly.set(row.userId, (maps.weekly.get(row.userId) ?? 0) + 1);
    if (countsTowardDaily(row, now)) maps.daily.set(row.userId, (maps.daily.get(row.userId) ?? 0) + 1);
  }
  return maps;
}
