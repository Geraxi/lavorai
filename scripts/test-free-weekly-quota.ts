import assert from "node:assert/strict";
import { DEFAULT_FREE_WEEKLY_APPLY_QUOTA, FREE_QUOTA_NON_CONSUMING_STATUSES, FREE_QUOTA_WORKER_INFLIGHT_STATUSES, freeQuotaWindowStart,
  freeWeeklyApplyQuota, hasPaidOrTrialApplicationAccess, usesFreeWeeklyQuota } from "../src/lib/billing";
import {
  countsTowardWeeklyQuota, isAcceptedWeeklySend, isQuotaExcludedHandoffOrHold,
  isWeeklyQuotaReservation, occupiesWeeklyQuotaSlot, QUOTA_LIVENESS_HELD_MESSAGE,
  weeklyQuotaUsageWhere,
} from "../src/lib/daily-application-cap";
import { SKIPPED_ATS_MANUAL_MESSAGE } from "../src/lib/ats-skip-hosts";
import { freeQuotaAvailable } from "../src/lib/application-worker-gates";
import { countsTowardWeekly } from "../src/lib/queue-sendability";
import { paidPriorityRank, PAID_PRIORITY_RANK as R } from "../src/lib/paid-priority";

delete process.env.FREE_WEEKLY_APPLY_QUOTA;
const now = new Date();
const old = new Date("2025-01-01T00:00:00Z");
const fresh = new Date(+now - 86400_000);
const future = new Date(+now + 30 * 86400_000);

assert.equal(DEFAULT_FREE_WEEKLY_APPLY_QUOTA, 5);
assert.equal(freeWeeklyApplyQuota({}), 5);
assert.equal(freeWeeklyApplyQuota({ FREE_WEEKLY_APPLY_QUOTA: "3" }), 3);
assert.equal(freeWeeklyApplyQuota({ FREE_WEEKLY_APPLY_QUOTA: "0" }), 0);
for (const bad of ["-1", "2.5", "abc", " "]) assert.equal(freeWeeklyApplyQuota({ FREE_WEEKLY_APPLY_QUOTA: bad }), 5);
assert.equal(+now - +freeQuotaWindowStart(now), 7 * 86400_000);

const paid = { tier: "pro", subscriptionStatus: "active", createdAt: old, currentPeriodEnd: future };
assert.equal(hasPaidOrTrialApplicationAccess(paid, now), true);
assert.equal(usesFreeWeeklyQuota(paid, now), false);
const cardTrial = { tier: "free", subscriptionStatus: "trialing", createdAt: fresh, currentPeriodEnd: future };
assert.equal(usesFreeWeeklyQuota(cardTrial, now), false, "trial with card keeps its daily limit");
assert.equal(usesFreeWeeklyQuota({ tier: "free", email: "antonella.lasalandra07@gmail.com", createdAt: old }, now), false, "lifetime Pro+");
const freeCases = [
  { tier: "free", subscriptionStatus: null, createdAt: old, currentPeriodEnd: null },
  { tier: "free", subscriptionStatus: null, createdAt: fresh, currentPeriodEnd: null },
  { tier: "pro", subscriptionStatus: "past_due", createdAt: old, currentPeriodEnd: future },
  { tier: "pro", subscriptionStatus: "canceled", createdAt: old, currentPeriodEnd: null },
  { tier: "pro", subscriptionStatus: "active", createdAt: old, currentPeriodEnd: new Date(0) },
];
for (const u of freeCases) assert.equal(usesFreeWeeklyQuota(u, now), true, JSON.stringify(u));
process.env.FREE_WEEKLY_APPLY_QUOTA = "0";
for (const u of freeCases) assert.equal(usesFreeWeeklyQuota(u, now), false);
delete process.env.FREE_WEEKLY_APPLY_QUOTA;

assert.deepEqual([...FREE_QUOTA_NON_CONSUMING_STATUSES].sort(), ["canceled", "cancelled", "diagnostic", "failed"]);
assert.ok(!FREE_QUOTA_WORKER_INFLIGHT_STATUSES.includes("queued"), "queued backlog does not block sends");
assert.ok(!FREE_QUOTA_WORKER_INFLIGHT_STATUSES.includes("ready_to_apply"), "handoffs are not in-flight");
assert.ok(!FREE_QUOTA_WORKER_INFLIGHT_STATUSES.includes("failed"));
assert.ok(!FREE_QUOTA_WORKER_INFLIGHT_STATUSES.includes("needs_answers"));

const weekNow = new Date("2026-10-24T12:00:00.000Z");
const weekStart = freeQuotaWindowStart(weekNow);
const withinWeek = new Date("2026-10-20T12:00:00Z");
const outsideWeek = new Date("2026-10-10T12:00:00Z");
const atBoundary = new Date(+weekStart);
const justInside = new Date(+weekStart + 1000);
const justOutside = new Date(+weekStart - 1000);

assert.equal(isQuotaExcludedHandoffOrHold({ status: "ready_to_apply", submitConfirmation: "NOT_SUBMITTED" }), true);

const excluded: Array<{ name: string; row: Parameters<typeof occupiesWeeklyQuotaSlot>[0] }> = [
  { name: "handoff ready_to_apply", row: { status: "ready_to_apply", submitConfirmation: "NOT_SUBMITTED", createdAt: withinWeek } },
  { name: "handoff UNCONFIRMED", row: { status: "ready_to_apply", submitConfirmation: "UNCONFIRMED", createdAt: withinWeek } },
  { name: "needs_answers", row: { status: "needs_answers", submitConfirmation: "NEEDS_ANSWERS", createdAt: withinWeek } },
  { name: "failed", row: { status: "failed", createdAt: withinWeek } },
  { name: "queued backlog", row: { status: "queued", createdAt: withinWeek } },
  { name: "CAPTCHA", row: { status: "ready_to_apply", submitConfirmation: "CAPTCHA", createdAt: withinWeek } },
  { name: "skip-list hold", row: { status: "ready_to_apply", errorMessage: SKIPPED_ATS_MANUAL_MESSAGE, createdAt: withinWeek } },
  { name: "liveness hold", row: { status: "queued", errorMessage: QUOTA_LIVENESS_HELD_MESSAGE, createdAt: withinWeek } },
  { name: "success outside window", row: { status: "success", submittedAt: justOutside } },
];
for (const { name, row } of excluded) {
  assert.equal(isAcceptedWeeklySend(row, weekNow), false, `${name} must not consume`);
  assert.equal(isWeeklyQuotaReservation(row), false, `${name} must not reserve`);
  assert.equal(occupiesWeeklyQuotaSlot(row, weekNow), false, `${name} must not occupy`);
  assert.equal(countsTowardWeeklyQuota(row, weekNow), false, `${name} shared helper`);
  assert.equal(countsTowardWeekly(row, weekNow), false, `${name} claim helper`);
}

assert.equal(isAcceptedWeeklySend({ status: "success", submittedAt: withinWeek }, weekNow), true);
assert.equal(isAcceptedWeeklySend({ status: "success", submittedAt: atBoundary }, weekNow), true, "inclusive start: exactly now-7d counts");
assert.equal(isAcceptedWeeklySend({ status: "success", submittedAt: justInside }, weekNow), true, "now-7d+1s counts");
assert.equal(isAcceptedWeeklySend({ status: "success", submittedAt: justOutside }, weekNow), false, "now-7d-1s does not count");
assert.equal(isAcceptedWeeklySend({ status: "success", submittedAt: outsideWeek }, weekNow), false);
assert.equal(isAcceptedWeeklySend({ status: "success" }, weekNow), false, "success without submittedAt does not consume");

for (const status of ["optimizing", "applying", "submitting", "answers_claimed"] as const) {
  const row = { status, createdAt: withinWeek };
  assert.equal(isAcceptedWeeklySend(row, weekNow), false, `${status} is not an accepted send`);
  assert.equal(isWeeklyQuotaReservation(row), true, `${status} occupies as reservation`);
  assert.equal(occupiesWeeklyQuotaSlot(row, weekNow), true);
}
assert.equal(isWeeklyQuotaReservation({ status: "ready_to_apply", submitConfirmation: "SUBMISSION_STARTED", createdAt: withinWeek }), true);
assert.equal(isAcceptedWeeklySend({ status: "ready_to_apply", submitConfirmation: "SUBMISSION_STARTED", createdAt: withinWeek }, weekNow), false);

type OccRow = {
  id: string; userId: string; status: string; submittedAt: Date | null;
  createdAt: Date; submitConfirmation: string | null; errorMessage: string | null;
};

function matchesWeeklyWhere(row: OccRow, where: ReturnType<typeof weeklyQuotaUsageWhere>): boolean {
  if (row.userId !== (where as { userId: string }).userId) return false;
  const exclude = (where as { id?: { not?: string; notIn?: string[] } }).id;
  if (exclude?.not && row.id === exclude.not) return false;
  if (exclude?.notIn?.includes(row.id)) return false;
  const or = (where as { OR: unknown[] }).OR;
  const accepted = or[0] as { status: string; submittedAt: { gte: Date } };
  if (row.status === accepted.status && row.submittedAt && +row.submittedAt >= +accepted.submittedAt.gte) return true;
  const reserved = or[1] as { AND: Array<Record<string, unknown>> };
  if (row.submittedAt || row.status === "success") return false;
  return reserved.AND.every((part) => {
    if (part.submittedAt === null || (part.submittedAt && typeof part.submittedAt === "object" && "equals" in (part.submittedAt as object))) {
      return row.submittedAt == null;
    }
    if (part.status && typeof part.status === "object" && "not" in (part.status as object)) {
      return row.status !== (part.status as { not: string }).not;
    }
    if (part.OR) {
      return (part.OR as Array<Record<string, unknown>>).some((clause) => {
        if (clause.status && typeof clause.status === "object" && "in" in (clause.status as object)) {
          return (clause.status as { in: string[] }).in.includes(row.status);
        }
        return row.status === clause.status && row.submitConfirmation === clause.submitConfirmation;
      });
    }
    if (part.NOT && (part.NOT as { errorMessage?: { in: string[] } }).errorMessage) {
      return !((part.NOT as { errorMessage: { in: string[] } }).errorMessage.in.includes(row.errorMessage ?? ""));
    }
    if (part.NOT && (part.NOT as { submitConfirmation?: string }).submitConfirmation) {
      return row.submitConfirmation !== (part.NOT as { submitConfirmation: string }).submitConfirmation;
    }
    return true;
  });
}

async function avail(used: number, user: object) {
  let where: unknown;
  const tx = { application: { count: async (args: { where: unknown }) => { where = args.where; return used; } } };
  const ok = await freeQuotaAvailable(tx as never, { id: "a", userId: "u", user: user as never }, now);
  return { ok, where };
}

function serializeLock() {
  let tail = Promise.resolve();
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.then(() => undefined, () => undefined);
    return run;
  };
}

(async () => {
  const freeUser = freeCases[0];
  assert.equal((await avail(4, freeUser)).ok, true);
  assert.equal((await avail(5, freeUser)).ok, false);
  const { where } = await avail(0, freeUser);
  assert.equal((where as { id: { not: string } }).id.not, "a", "excludes the row being admitted");
  assert.equal((await avail(999, paid)).ok, true, "paid users never hit the free count");

  const rows: OccRow[] = [
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `ok-${i}`, userId: "u", status: "success", submittedAt: withinWeek,
      createdAt: withinWeek, submitConfirmation: "EMAIL_SENT", errorMessage: null,
    })),
    { id: "q1", userId: "u", status: "queued", submittedAt: null, createdAt: withinWeek, submitConfirmation: null, errorMessage: null },
    { id: "q2", userId: "u", status: "queued", submittedAt: null, createdAt: withinWeek, submitConfirmation: null, errorMessage: null },
    { id: "handoff", userId: "u", status: "ready_to_apply", submittedAt: null, createdAt: withinWeek, submitConfirmation: "NOT_SUBMITTED", errorMessage: null },
    { id: "failed", userId: "u", status: "failed", submittedAt: null, createdAt: withinWeek, submitConfirmation: null, errorMessage: "boom" },
    { id: "answers", userId: "u", status: "needs_answers", submittedAt: null, createdAt: withinWeek, submitConfirmation: "NEEDS_ANSWERS", errorMessage: null },
  ];
  const occupancy = (exclude: string) => rows.filter((r) => matchesWeeklyWhere(r, weeklyQuotaUsageWhere("u", weekNow, [exclude]))).length;
  assert.equal(occupancy("q1"), 4, "Prisma occupancy filter counts only the 4 accepted sends");
  assert.equal(occupancy("handoff"), 4);
  assert.equal(occupancy("failed"), 4);

  const lock = serializeLock();
  const admit = async (id: string) => lock(async () => {
    const used = occupancy(id);
    const ok = await freeQuotaAvailable({
      application: { count: async () => used },
    } as never, { id, userId: "u", user: freeUser as never }, weekNow);
    if (!ok) return false;
    const row = rows.find((r) => r.id === id)!;
    row.status = "optimizing";
    return true;
  });
  const claimed = await Promise.all([admit("q1"), admit("q2")]);
  assert.equal(claimed.filter(Boolean).length, 1, "concurrent claims cannot exceed the weekly limit");
  assert.equal(rows.filter((r) => occupiesWeeklyQuotaSlot(r, weekNow)).length, 5, "4 accepted + 1 reservation");
  assert.equal(rows.find((r) => r.id === "q1")!.status === "queued" || rows.find((r) => r.id === "q2")!.status === "queued", true);

  const reserved = rows.find((r) => r.status === "optimizing")!;
  reserved.status = "failed";
  reserved.errorMessage = "adapter_failed";
  assert.equal(occupiesWeeklyQuotaSlot(reserved, weekNow), false, "failure releases the reservation");
  reserved.status = "ready_to_apply";
  reserved.submitConfirmation = "NOT_SUBMITTED";
  reserved.errorMessage = SKIPPED_ATS_MANUAL_MESSAGE;
  assert.equal(occupiesWeeklyQuotaSlot(reserved, weekNow), false, "handoff releases the reservation");
  reserved.status = "needs_answers";
  reserved.submitConfirmation = "NOT_SUBMITTED";
  reserved.errorMessage = null;
  assert.equal(occupiesWeeklyQuotaSlot(reserved, weekNow), false, "needs-answers releases the reservation");
})().then(() => console.log("free weekly quota worker admission + concurrent claim: ok"), (e) => { console.error(e); process.exitCode = 1; });

for (const u of freeCases) assert.equal(paidPriorityRank(u), R.none);
console.log("free weekly quota: ok");
