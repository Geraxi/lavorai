/**
 * Per-user daily auto-apply cap. Counts only rows that were actually sent
 * or are currently in flight — never handoffs (needs_answers, CAPTCHA /
 * finish-it-yourself, NOT_SUBMITTED / unconfirmed). The day is Europe/Rome,
 * not the server's UTC midnight.
 */
import { romeDayStart } from "@/lib/mailbox/send-guard";

export { romeDayStart };

/** Claimed / sending / still-queued work that occupies a daily slot. */
export const DAILY_CAP_IN_FLIGHT_STATUSES = [
  "queued",
  "optimizing",
  "applying",
  "submitting",
  "answers_claimed",
] as const;

export const DAILY_CAP_SENT_STATUSES = ["success"] as const;

/** ready_to_apply only counts while a send is in flight. */
export const DAILY_CAP_IN_FLIGHT_CONFIRMATION = "SUBMISSION_STARTED";

const IN_FLIGHT = new Set<string>(DAILY_CAP_IN_FLIGHT_STATUSES);
const SENT = new Set<string>(DAILY_CAP_SENT_STATUSES);

export type DailyCapRow = {
  status: string;
  submittedAt?: Date | string | null;
  submitConfirmation?: string | null;
  createdAt?: Date | string | null;
};

/** True when this row occupies a daily-cap slot (ignore createdAt here). */
export function countsTowardDailyCap(row: DailyCapRow): boolean {
  if (row.submittedAt) return true;
  if (SENT.has(row.status)) return true;
  if (IN_FLIGHT.has(row.status)) return true;
  return row.status === "ready_to_apply" && row.submitConfirmation === DAILY_CAP_IN_FLIGHT_CONFIRMATION;
}

/** Prisma `where` for today's cap usage for one user. */
export function dailyCapUsageWhere(userId: string, now = new Date()) {
  return {
    userId,
    createdAt: { gte: romeDayStart(now) },
    OR: [
      { submittedAt: { not: null } },
      { status: { in: [...DAILY_CAP_IN_FLIGHT_STATUSES, ...DAILY_CAP_SENT_STATUSES] } },
      { status: "ready_to_apply", submitConfirmation: DAILY_CAP_IN_FLIGHT_CONFIRMATION },
    ],
  };
}

export async function countDailyCapUsage(
  db: { application: { count: (args?: any) => Promise<number> } },
  userId: string,
  now = new Date(),
): Promise<number> {
  return db.application.count({ where: dailyCapUsageWhere(userId, now) });
}

/** How many more sendable rows may be created today. */
export function remainingDailyCap(used: number, limit: number): number {
  return Math.max(0, limit - used);
}
