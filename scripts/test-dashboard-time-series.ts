/**
 * Dashboard visuals: sparkline + weekly-trend series are evidence-backed,
 * owner-scoped and bucketed correctly. Mock database, no external calls.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(path: string, dependencies: Record<string, unknown>) {
  const module = { exports: {} as Record<string, any> };
  const output = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(output, { module, exports: module.exports, Date, console,
    require: (id: string) => { assert.ok(id in dependencies, `Unexpected dependency ${id}`); return dependencies[id]; },
  }, { filename: path });
  return module.exports;
}

const DAY = 86_400_000;
// Monday 19 Oct 2026, 10:00 UTC (12:00 Europe/Rome).
const now = new Date("2026-10-19T10:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * DAY);

const receipts = load("src/lib/submission-receipt.ts", {});
const evidence = load("src/lib/application-evidence.ts", { "@/lib/submission-receipt": receipts });

const delivered = (id: string, days: number, userId = "owner") => ({
  id, userId, status: "success", submittedVia: "email_recruiter", submitConfirmation: "EMAIL_SENT", submissionReceiptJson: null,
  submittedAt: ago(days), completedAt: ago(days), createdAt: ago(days + 1),
  emailAttempts: [{ status: "delivered", providerEmailId: `p-${id}`, acceptedAt: ago(days), createdAt: ago(days) }],
});
const applications = [
  delivered("d1", 1), delivered("d2", 3), delivered("d3", 10), delivered("d4", 40), delivered("d5", 70 /* outside 8 weeks */),
  { ...delivered("accepted", 2), emailAttempts: [{ status: "accepted", providerEmailId: "p-acc", acceptedAt: ago(2), createdAt: ago(2) }] },
  { ...delivered("bounced", 2), emailAttempts: [{ status: "bounced", providerEmailId: "p-b", acceptedAt: ago(2), createdAt: ago(2) }] },
  { ...delivered("legacy", 2), emailAttempts: [] },
  { ...delivered("mock", 2), submittedVia: "mock_demo" },
  delivered("foreign", 2, "someone-else"),
];
let applicationQueries = 0;
const db = {
  application: {
    findMany: async (query: any) => {
      applicationQueries++;
      assert.equal(query.where.userId, "owner", "series reads only the owner's applications");
      assert.equal(query.take, 200); assert.equal(query.select.emailAttempts.take, 1);
      return applications; // includes a foreign row on purpose: the function must re-check ownership
    },
  },
  applicationReply: {
    findMany: async (query: any) => {
      assert.equal(query.where.application.userId, "owner");
      assert.equal(query.where.isHuman, true); assert.equal(query.where.isSecurityCode, false);
      assert.equal(JSON.stringify(query.where.kind.in), JSON.stringify(["risposta", "colloquio", "rifiutata"]));
      return [
        { applicationId: "d3", receivedAt: ago(8), kind: "colloquio" },
        { applicationId: "d3", receivedAt: ago(5), kind: "colloquio" }, // second invite, same app: one interview
        { applicationId: "d2", receivedAt: ago(1), kind: "risposta" },
      ];
    },
  },
  gmailMessage: {
    findMany: async (query: any) => {
      assert.equal(query.where.userId, "owner"); assert.equal(query.where.isHuman, true);
      assert.equal(JSON.stringify(query.where.applicationId), JSON.stringify({ not: null }));
      // Same reply synced from Gmail on the same day: must not double count.
      return [{ applicationId: "d2", date: new Date(ago(1).getTime() + 60_000), kind: "risposta" }];
    },
  },
};
const metrics = load("src/lib/dashboard-metrics-shared.ts", { "@/lib/db": { prisma: db }, "@/lib/application-evidence": evidence });

async function main() {
  // Pure bucketing
  assert.equal(JSON.stringify(metrics.bucketDaily([ago(0), ago(0), ago(29), ago(30)], now, 30).filter((n: number) => n > 0)), "[1,2]");
  const starts = metrics.trendWeekStarts(now, 8);
  assert.equal(starts.length, 8);
  assert.equal(starts[7], metrics.zonedDayNumber(now) - 6, "last window ends today");
  assert.equal(starts[1] - starts[0], 7);
  assert.equal(JSON.stringify(metrics.bucketWeekly([ago(0), ago(6), ago(7), ago(55), ago(56)], now, 8)), "[1,0,0,0,0,0,1,2]");
  // Zone: 23:30 UTC on 18 Oct is already 19 Oct in Rome.
  assert.equal(metrics.zonedDayNumber(new Date("2026-10-18T23:30:00Z")), metrics.zonedDayNumber(new Date("2026-10-19T08:00:00Z")));

  const series = await metrics.getDashboardTimeSeries("owner", now);
  assert.equal(applicationQueries, 1);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  assert.equal(sum(series.daily.confirmed), 3, "30-day confirmed = delivered only (no accepted/bounced/legacy/mock/foreign, no 40-day-old)");
  assert.equal(sum(series.daily.replies), 3, "replies de-duplicated per application per day across channels (Gmail copy of d2 not counted twice)");
  assert.equal(sum(series.daily.interviews), 1, "one interview per application");
  assert.equal(series.offersHistoryAvailable, false, "offers have no timestamps, so no fabricated history");
  assert.equal(series.weeks.length, 8);
  assert.equal(sum(series.weeks.map((w: any) => w.sent)), 4, "8-week sends include the 40-day-old one, exclude the 70-day-old one");
  assert.equal(series.weeks[7].sent, 2); assert.equal(series.weeks[6].sent, 1);
  assert.equal(series.weeks[7].end, "2026-10-19"); assert.equal(series.weeks[0].start, "2026-08-25");
  const chart = load("src/components/ui-premium/chart-path.ts", {});
  assert.equal(chart.niceMax(0), 1); assert.equal(chart.niceMax(2), 2); assert.equal(chart.niceMax(3), 5); assert.equal(chart.niceMax(11), 20);
  const flat = chart.monotonePath([{ x: 0, y: 100 }, { x: 50, y: 100 }, { x: 100, y: 100 }]);
  assert.ok(flat.split(/[ ,MC]+/).filter(Boolean).every((v: string, i: number) => i % 2 === 0 || Number(v) === 100), "flat zero series stays on the baseline (no overshoot)");
  const bump = chart.monotonePath([{ x: 0, y: 100 }, { x: 50, y: 0 }, { x: 100, y: 100 }]);
  assert.ok(bump.split(/[ ,MC]+/).filter(Boolean).every((v: string, i: number) => i % 2 === 0 || (Number(v) >= 0 && Number(v) <= 100)), "monotone curve never leaves the data range");
  console.log("PASS dashboard time series: evidence-only sends, owner scoping, cross-channel reply de-dup, rolling 8-week and 30-day buckets in Europe/Rome.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
