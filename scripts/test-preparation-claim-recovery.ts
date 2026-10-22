import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Hermetic database model: no credentials, sockets, or external submissions.
const now = new Date("2026-10-21T12:00:00Z");
const base = { id: "pristine", userId: "u", jobId: "j", status: "queued", startedAt: new Date(+now - 30 * 60_000),
  createdAt: new Date("2026-10-20T12:00:00Z"), consentGrantedAt: null, retryCount: 0,
  completedAt: null, submittedAt: null, submittedVia: null, submitConfirmation: null,
  submissionReceiptJson: null, answerContinuationJson: null, cvDocxPath: null, cvPdfPath: null,
  coverLetterPath: null, canaryLog: null, answersUsedJson: null, errorMessage: null,
  viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null, emailAttempts: [] };
let rows: any[] = [];
let reservation = false;
const reservedIds = new Set<string>();
let race = false;
let paused = false;
function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === "emailAttempts") return row.emailAttempts.length === 0;
    if (value?.gt) return row[key] > value.gt;
    if (value?.lt) return row[key] != null && +row[key] < +value.lt;
    if (value instanceof Date) return +row[key] === +value;
    return row[key] === value;
  });
}
const application = {
  findMany: async ({ where, take }: any) => rows.filter(row => matches(row, where)).sort((a, b) => a.id.localeCompare(b.id)).slice(0, take).map(row => ({ ...row })),
  updateMany: async ({ where, data }: any) => {
    const selected = rows.filter(row => matches(row, where));
    selected.forEach(row => Object.assign(row, data)); return { count: selected.length };
  },
};
const prisma: any = { application, applicationSubmissionReservation: { findFirst: async ({ where }: any) => reservation || reservedIds.has(where.OR[0].applicationId) ? { id: "reservation" } : null },
  $queryRaw: async () => { if (race) rows[0].status = "optimizing"; },
  $transaction: async (fn: any) => fn(prisma) };
const dependencies: Record<string, any> = {
  "./application-answer-continuation": {}, "@/lib/application-worker-gates": {},
  "@/lib/application-submission-budget": { submissionSubjectKey: () => "u:j" },
  "@/lib/application-pause": { applicationsPaused: () => paused }, "@/lib/db": { prisma },
  "@/lib/application-rollout": { rolloutCreationBlocked: () => false,
    historicalRetriesBlocked: () => true,
    rolloutApplicationIneligibility: (row: any) => row.createdAt < new Date("2026-10-14T12:04:49Z") ? "historical" : null },
};
const module = { exports: {} as any };
vm.runInNewContext(ts.transpileModule(readFileSync("src/lib/application-claim.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module, exports: module.exports, Date, require: (id: string) => {
  assert.ok(id in dependencies, `Unexpected dependency ${id}`); return dependencies[id];
} });
async function run() {
  rows = [{ ...base }];
  assert.equal(await module.exports.recoverPrePreparationClaims(now), 1);
  assert.equal(rows[0].startedAt, null);
  assert.equal(await module.exports.recoverPrePreparationClaims(now), 0, "idempotent");
  for (const patch of [
    { status: "applying" }, { status: "submitting" }, { status: "optimizing" },
    { startedAt: new Date(+now - 1000) }, { startedAt: null },
    { submitConfirmation: "SUBMISSION_STARTED" }, { submitConfirmation: "NOT_SUBMITTED" },
    { submissionReceiptJson: "receipt" }, { submittedAt: now }, { submittedVia: "email" },
    { cvDocxPath: "cv" }, { cvPdfPath: "cv" }, { coverLetterPath: "cl" },
    { answerContinuationJson: "proof" }, { answersUsedJson: "answers" }, { canaryLog: "log" },
    { errorMessage: "privacy missing" }, { emailAttempts: [{}] }, { retryCount: 1 },
    { replyCount: 1 }, { createdAt: new Date("2026-10-01") },
  ]) {
    rows = [{ ...base, ...patch }];
    assert.equal(await module.exports.recoverPrePreparationClaims(now), 0, JSON.stringify(patch));
  }
  rows = [{ ...base }]; reservation = true;
  assert.equal(await module.exports.recoverPrePreparationClaims(now), 0, "immutable ledger");
  reservation = false; race = true;
  assert.equal(await module.exports.recoverPrePreparationClaims(now), 0, "worker transition wins");
  race = false;
  rows = Array.from({ length: 60 }, (_, index) => ({ ...base, id: `a${String(index).padStart(3, "0")}` }));
  rows.forEach(row => reservedIds.add(row.id));
  rows.push({ ...base, id: "z-valid" });
  assert.equal(await module.exports.recoverPrePreparationClaims(now), 1, "excluded first page must not starve later valid claim");
  assert.equal(rows.at(-1).startedAt, null);
  reservedIds.clear();
  paused = true; rows = [{ ...base }];
  assert.equal(await module.exports.recoverPrePreparationClaims(now), 0, "kill switch");
  console.log("PASS pre-preparation recovery: stale only, evidence/attempt/ledger exclusions, historical cutoff, CAS race, idempotency and pause");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
