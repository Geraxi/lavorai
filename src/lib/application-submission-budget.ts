import type { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { applicationRolloutConfig } from "@/lib/application-rollout";

export type SubmissionBudgetAttempt = {
  applicationId: string; subjectKey: string; attemptStartedAt: Date; channel: string;
};

/** Opaque, stable duplicate scope survives deletion of the application row.
 * No names, addresses, CV contents or raw user/job IDs are retained. */
export function submissionSubjectKey(userId: string, jobId: string): string {
  return createHash("sha256").update(JSON.stringify(["lavorai-submission-v1", userId, jobId])).digest("hex");
}

/** Called inside the same transaction as the application's delivery fence.
 * One shared lock serializes ALL users/channels. There are no refunds or ledger
 * deletes: a rejected, uncertain, crashed or abandoned attempt still consumes
 * its reservation. Rechecks can append a UTC-day reservation, never a new
 * attempt. This deliberately counts possible transmissions conservatively.
 */
export async function reserveSubmissionBudget(
  tx: Prisma.TransactionClient, attempt: SubmissionBudgetAttempt, phase: "begin" | "recheck",
): Promise<string | null> {
  if (!/^(?:email_recruiter|playwright_portal|portal_[a-z0-9_-]+)$/.test(attempt.channel)) return "rollout_channel_invalid";
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(1735274851, 20261014)`;
  // Read the database clock AFTER waiting for the global lock, so a transaction
  // that waited across UTC midnight cannot spend yesterday's remaining budget.
  const clocks = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  const now = clocks[0]?.now;
  if (!(now instanceof Date) || !Number.isFinite(+now)) return "rollout_clock_unavailable";
  const config = applicationRolloutConfig(now);
  if (!config.enabled) return config.reason;
  const budgetDay = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const previous = await tx.applicationSubmissionReservation.findMany({ where: {
    OR: [{ applicationId: attempt.applicationId }, { subjectKey: attempt.subjectKey }],
  } });
  if (phase === "begin" && previous.length) return "rollout_attempt_already_reserved";
  if (phase === "recheck" && !previous.length) return "rollout_reservation_missing";
  if (previous.some(row => row.applicationId !== attempt.applicationId || row.subjectKey !== attempt.subjectKey
    || +row.attemptStartedAt !== +attempt.attemptStartedAt || row.channel !== attempt.channel
    || +row.rolloutStartedAt !== +config.startedAt!)) return "rollout_attempt_mismatch";
  const existingToday = previous.some(row => +row.budgetDay === +budgetDay);
  const consumed = await tx.applicationSubmissionReservation.count({ where: { budgetDay } });
  if (existingToday ? consumed > config.dailyCap! : consumed >= config.dailyCap!) return "rollout_daily_budget_reached";
  if (!existingToday) await tx.applicationSubmissionReservation.create({ data: {
    ...attempt, budgetDay, rolloutStartedAt: config.startedAt!,
  } });
  return null;
}
