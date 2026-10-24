/**
 * Per-user daily auto-apply cap: only sent / in-flight rows, Europe/Rome day.
 * Handoffs and liveness holds never occupy a slot. No network, no real DB.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SKIPPED_ATS_MANUAL_MESSAGE } from "../src/lib/ats-skip-hosts";
import {
  countsTowardDailyCap,
  countDailyCapUsage,
  dailyCapUsageWhere,
  QUOTA_LIVENESS_HELD_MESSAGE,
  remainingDailyCap,
  romeDayStart,
} from "../src/lib/daily-application-cap";

const COUNTED = ["queued", "optimizing", "applying", "submitting", "answers_claimed", "success"] as const;
const HANDOFF = [
  { status: "needs_answers", submitConfirmation: "NEEDS_ANSWERS" },
  { status: "ready_to_apply", submitConfirmation: "CAPTCHA" },
  { status: "ready_to_apply", submitConfirmation: "NOT_SUBMITTED" },
  { status: "ready_to_apply", submitConfirmation: "UNCONFIRMED" },
  { status: "ready_to_apply", submitConfirmation: "DRY_RUN" },
  { status: "ready_to_apply", errorMessage: SKIPPED_ATS_MANUAL_MESSAGE },
  { status: "queued", errorMessage: QUOTA_LIVENESS_HELD_MESSAGE },
  { status: "failed", submitConfirmation: "JOB_CLOSED" },
  { status: "diagnostic", submitConfirmation: null },
  { status: "cancelled", submitConfirmation: null },
  { status: "awaiting_consent", submitConfirmation: null },
  { status: "needs_session", submitConfirmation: null },
] as const;

let passed = 0;
async function test(name: string, fn: () => unknown | Promise<unknown>) {
  await fn();
  passed++;
  console.log(`  ok ${name}`);
}

type Row = {
  userId: string;
  status: string;
  createdAt: Date;
  submittedAt: Date | null;
  submitConfirmation: string | null;
  errorMessage: string | null;
};

function matchClause(row: Row, clause: Record<string, unknown>): boolean {
  if ("submittedAt" in clause) return row.submittedAt != null;
  if ("submitConfirmation" in clause) {
    const conf = clause.submitConfirmation;
    if (typeof conf === "string") return row.submitConfirmation === conf;
    return row.status === clause.status && row.submitConfirmation === (conf as { equals?: string } | undefined);
  }
  if ("status" in clause && clause.status && typeof clause.status === "object" && "in" in (clause.status as object)) {
    return ((clause.status as { in: string[] }).in).includes(row.status);
  }
  if ("status" in clause && typeof clause.status === "string") {
    const conf = clause.submitConfirmation;
    return row.status === clause.status && (conf === undefined || row.submitConfirmation === conf);
  }
  if ("errorMessage" in clause && clause.errorMessage && typeof clause.errorMessage === "object" && "in" in (clause.errorMessage as object)) {
    return ((clause.errorMessage as { in: string[] }).in).includes(row.errorMessage ?? "");
  }
  return false;
}

function matchesWhere(row: Row, where: ReturnType<typeof dailyCapUsageWhere>): boolean {
  if (row.userId !== where.userId) return false;
  if (row.createdAt < where.createdAt.gte) return false;
  const and = where.AND as Array<Record<string, unknown>>;
  return and.every((part) => {
    if ("OR" in part) return (part.OR as Array<Record<string, unknown>>).some((c) => matchClause(row, c));
    if ("NOT" in part) return !matchClause(row, part.NOT as Record<string, unknown>);
    return matchClause(row, part);
  });
}

async function countWith(rows: Row[], userId: string, now: Date): Promise<number> {
  const db = {
    application: {
      count: async ({ where }: { where?: unknown }) =>
        rows.filter((r) => matchesWhere(r, where as ReturnType<typeof dailyCapUsageWhere>)).length,
    },
  };
  return countDailyCapUsage(db, userId, now);
}

const now = new Date("2026-10-24T08:28:00.000Z"); // 10:28 Rome
const todayRome = new Date("2026-10-24T00:28:00.000Z"); // 02:28 Rome — production create time
const yesterdayRome = new Date("2026-10-23T20:00:00.000Z"); // 22:00 Rome 23 Oct, before Rome midnight

function row(patch: Partial<Row> = {}): Row {
  return {
    userId: "owner",
    status: "queued",
    createdAt: todayRome,
    submittedAt: null,
    submitConfirmation: null,
    errorMessage: null,
    ...patch,
  };
}

async function main() {
  console.log("daily-application-cap");

  await test("sent and in-flight statuses occupy a slot", () => {
    for (const status of COUNTED) assert.equal(countsTowardDailyCap({ status }), true, status);
    assert.equal(countsTowardDailyCap({ status: "ready_to_apply", submitConfirmation: "SUBMISSION_STARTED" }), true);
    assert.equal(countsTowardDailyCap({ status: "ready_to_apply", submittedAt: new Date() }), true);
  });

  await test("handoffs, needs_answers, CAPTCHA, skipped-ATS and liveness holds do not occupy a slot", () => {
    for (const r of HANDOFF) assert.equal(countsTowardDailyCap(r), false, JSON.stringify(r));
    assert.equal(countsTowardDailyCap({ status: "ready_to_apply", submitConfirmation: null }), false);
  });

  await test("remainingDailyCap never goes negative", () => {
    assert.equal(remainingDailyCap(0, 5), 5);
    assert.equal(remainingDailyCap(5, 5), 0);
    assert.equal(remainingDailyCap(8, 5), 0);
  });

  await test("today is Europe/Rome midnight, not UTC", () => {
    const romeMorning = new Date("2026-10-23T22:30:00.000Z"); // 00:30 Rome on 24 Oct
    assert.equal(romeDayStart(romeMorning).toISOString(), "2026-10-23T22:00:00.000Z");
    assert.ok(+romeDayStart(romeMorning) < +new Date("2026-10-24T00:00:00.000Z"), "Rome day starts before UTC midnight");
    assert.equal(romeDayStart(new Date("2026-10-23T21:30:00Z")).toISOString(), "2026-10-22T22:00:00.000Z");
    assert.equal(romeDayStart(new Date("2026-12-01T12:00:00Z")).toISOString(), "2026-11-30T23:00:00.000Z");
  });

  await test("owner bug: 5 unsent handoff rows at 02:28 Rome do not fill a dailyCap of 5", async () => {
    const handoff = [
      row({ status: "needs_answers", submitConfirmation: "NEEDS_ANSWERS" }),
      row({ status: "ready_to_apply", submitConfirmation: "CAPTCHA" }),
      row({ status: "ready_to_apply", submitConfirmation: "NOT_SUBMITTED" }),
      row({ status: "ready_to_apply", submitConfirmation: "UNCONFIRMED" }),
      row({ status: "needs_answers", submitConfirmation: null }),
    ];
    const used = await countWith(handoff, "owner", now);
    assert.equal(used, 0);
    assert.equal(remainingDailyCap(used, 5), 5);
  });

  await test("Ashby skip-list and liveness-held queued rows do not occupy a slot", async () => {
    const rows = [
      row({ status: "ready_to_apply", errorMessage: SKIPPED_ATS_MANUAL_MESSAGE }),
      row({ status: "ready_to_apply", errorMessage: SKIPPED_ATS_MANUAL_MESSAGE }),
      row({ status: "queued", errorMessage: QUOTA_LIVENESS_HELD_MESSAGE, submitConfirmation: "NOT_SUBMITTED" }),
      row({ status: "queued" }),
      row({ status: "success", submittedAt: todayRome }),
    ];
    assert.equal(await countWith(rows, "owner", now), 2);
    assert.equal(remainingDailyCap(2, 5), 3);
  });

  await test("5 in-flight/sent rows fill a dailyCap of 5", async () => {
    const inFlight = [
      row({ status: "queued" }),
      row({ status: "applying", submitConfirmation: "SUBMISSION_STARTED" }),
      row({ status: "success", submittedAt: todayRome, submitConfirmation: "DETECTED_HTTP_2xx" }),
      row({ status: "ready_to_apply", submitConfirmation: "SUBMISSION_STARTED" }),
      row({ status: "optimizing" }),
    ];
    assert.equal(await countWith(inFlight, "owner", now), 5);
    assert.equal(remainingDailyCap(5, 5), 0);
  });

  await test("mixed handoffs + sent leave remaining slots", async () => {
    const mixed = [
      row({ status: "needs_answers", submitConfirmation: "NEEDS_ANSWERS" }),
      row({ status: "ready_to_apply", submitConfirmation: "CAPTCHA" }),
      row({ status: "queued" }),
      row({ status: "success", submittedAt: todayRome }),
    ];
    assert.equal(await countWith(mixed, "owner", now), 2);
    assert.equal(remainingDailyCap(2, 5), 3);
  });

  await test("previous Rome day and other users are excluded", async () => {
    assert.equal(await countWith([row({ status: "queued", createdAt: yesterdayRome })], "owner", now), 0);
    assert.equal(await countWith([row({ userId: "other", status: "queued" })], "owner", now), 0);
  });

  await test("where clause is Rome-bounded and omits handoff statuses", () => {
    const where = dailyCapUsageWhere("owner", now);
    assert.equal(+where.createdAt.gte, +romeDayStart(now));
    const include = JSON.stringify(where.AND);
    assert.ok(include.includes("queued"));
    assert.ok(!include.includes("needs_answers"));
    assert.ok(include.includes("CAPTCHA"));
    assert.ok(include.includes(SKIPPED_ATS_MANUAL_MESSAGE.slice(0, 20)));
    assert.ok(include.includes(QUOTA_LIVENESS_HELD_MESSAGE.slice(0, 20)));
    assert.match(
      readFileSync(new URL("../src/lib/job-liveness.ts", import.meta.url), "utf8"),
      new RegExp(QUOTA_LIVENESS_HELD_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  });

  await test("auto-apply, apply, apply-batch and sidebar use the shared counter", () => {
    const cron = readFileSync(new URL("../src/lib/auto-apply-cron.ts", import.meta.url), "utf8");
    assert.match(cron, /countDailyCapUsage/);
    assert.match(cron, /countsTowardQuota/);
    assert.match(cron, /monthlyQuotaUsageWhere/);
    assert.match(cron, /companyCapUsageWhere/);
    assert.doesNotMatch(cron, /createdAt: \{ gte: todayStart \}/);
    for (const file of [
      "../src/app/api/applications/apply/route.ts",
      "../src/app/api/applications/apply-batch/route.ts",
      "../src/app/api/sidebar-stats/route.ts",
    ]) {
      assert.match(readFileSync(new URL(file, import.meta.url), "utf8"), /countDailyCapUsage/, file);
    }
  });

  console.log(`daily-application-cap: ${passed} passed`);
}

main().catch((err) => { console.error(err); process.exit(1); });
