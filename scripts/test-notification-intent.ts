import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { parseVerifiedSubmissionReceipt, receiptJobId } from "../src/lib/submission-receipt";

// Execute the actual completion function with an isolated transactional boundary.
const token = new Date(Date.now() - 1000);
const initial = { id: "a", userId: "u", jobId: "j", startedAt: token, status: "applying", submitConfirmation: "SUBMISSION_STARTED",
  answerContinuationJson: null, session: null, job: { url: "https://boards.greenhouse.io/fixture/jobs/123" },
  submissionReceiptJson: null, sentNotificationRequiredAt: null };
let persisted: any = structuredClone(initial);
let failCommit = false;
let writes = 0;
const context = {
  Date, prisma: {}, SUBMISSION_STARTED: "SUBMISSION_STARTED",
  parseAnswerContinuation: () => null, submissionSubjectKey: () => "u:j", parseVerifiedSubmissionReceipt, receiptJobId,
  withLockedApplication: async (_id: string, _db: unknown, work: any) => {
    const snapshot = structuredClone(persisted);
    const tx = { applicationSubmissionReservation: { findFirst: async () => ({ id: "reservation" }) },
      application: { updateMany: async ({ data }: any) => {
        // The proof and intent must be part of the very same DB update.
        assert.equal(data.status, "success");
        assert.ok(data.sentNotificationRequiredAt instanceof Date);
        assert.ok(data.submissionReceiptJson);
        Object.assign(snapshot, data); writes++; return { count: 1 };
      } } };
    const result = await work(tx, structuredClone(persisted));
    if (failCommit) throw Error("crash before transaction commit");
    persisted = snapshot;
    return result;
  },
};
const source = readFileSync("src/lib/application-worker-gates.ts", "utf8");
const start = source.indexOf("export async function completeApplicationSubmission(");
const end = source.indexOf("/** Read-only validation", start);
const module = { exports: {} as any };
vm.runInNewContext(ts.transpileModule(source.slice(start, end), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText, { ...context, module, exports: module.exports });
const complete = module.exports.completeApplicationSubmission;
const receipt = JSON.stringify({ version: 1, provider: "greenhouse", kind: "dom", capturedAt: new Date().toISOString(),
  jobId: "123", signal: "new_receipt_and_form_removed" });
const outcome = { submittedVia: "portal_greenhouse", submitConfirmation: "DETECTED", submittedAt: new Date(), submissionReceiptJson: receipt };
async function main() {
  failCommit = true;
  await assert.rejects(complete("a", token, outcome), /crash before transaction commit/);
  assert.equal(persisted.status, "applying"); assert.equal(persisted.sentNotificationRequiredAt, null);
  assert.equal(persisted.submissionReceiptJson, null);
  failCommit = false;
  assert.equal(await complete("a", token, outcome), true);
  assert.equal(persisted.status, "success"); assert.equal(persisted.submissionReceiptJson, receipt);
  assert.ok(persisted.sentNotificationRequiredAt instanceof Date);
  // Process death after commit loses only the immediate delivery call, not intent.
  const intent = +persisted.sentNotificationRequiredAt;
  assert.equal(await complete("a", token, outcome), false);
  assert.equal(+persisted.sentNotificationRequiredAt, intent); assert.equal(writes, 2);
  persisted = { ...structuredClone(initial), status: "success", submissionReceiptJson: receipt };
  assert.equal(await complete("a", token, outcome), false);
  assert.equal(persisted.sentNotificationRequiredAt, null, "legacy success is not opted in by replay");
  persisted = structuredClone(initial);
  assert.equal(await complete("a", token, { ...outcome, submissionReceiptJson: receipt.replace('"123"', '"456"') }), false);
  assert.equal(persisted.sentNotificationRequiredAt, null);
  // Existing cron must reconcile manual sends too, without activating producers.
  let notified = 0;
  let paused = false;
  const cronModule = { exports: {} as any };
  const dependencies: Record<string, unknown> = {
    "@/lib/application-rollout": { automaticApplicationsBlocked: () => true },
    "@/lib/application-pause": { applicationsPaused: () => paused },
    "@/lib/application-sent-notification": { reconcileApplicationSentNotifications: async () => { notified++; } },
    "@/lib/cv-profile-ensure": {}, "@/lib/held-application-release": {}, "@/lib/application-claim": {},
  };
  vm.runInNewContext(ts.transpileModule(readFileSync("src/lib/cron-self-heal.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: cronModule, exports: cronModule.exports, console,
    require: (id: string) => { assert.ok(id in dependencies, id); return dependencies[id]; } });
  assert.equal((await cronModule.exports.runCronSelfHeal()).appsRecoveredSafely, 0);
  assert.equal(notified, 1, "manual_only still reconciles notifications");
  paused = true;
  await cronModule.exports.runCronSelfHeal(); assert.equal(notified, 1, "hard pause stops notifications too");
  console.log("PASS completion atomic proof+intent, rollback before commit, durable intent after commit/crash, duplicate completion and legacy/wrong-job exclusion");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
