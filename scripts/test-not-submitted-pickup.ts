/**
 * NOT_SUBMITTED pickup gap: released rows with zero submit evidence become
 * claimable again; any sign of a started submit keeps the row excluded.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as rollout from "../src/lib/application-rollout";
import * as drainLimits from "../src/lib/drain-limits";
import { submissionSubjectKey } from "../src/lib/application-submission-budget";

process.env.APPLICATION_SENDING_MODE = "automatic";
process.env.APPLICATION_ROLLOUT_START_AT = new Date(Date.now() - 3_600_000).toISOString();
delete process.env.APPLICATIONS_PAUSED;
delete process.env.DRAIN_MAX_ATTEMPTS;

const HELD = "Invio in attesa:";
const CONTROLLED = "Invio in attesa: in attesa di rilascio controllato. Questa elaborazione non ha effettuato nuovi invii.";
const MAX_PREFIX = "Invio interrotto dopo";

function load(path: string, mocks: Record<string, any>): any {
  const js = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: any = {};
  new Function("require", "exports", "console", js)((name: string) => {
    if (name in mocks) return mocks[name];
    throw new Error(`unexpected dependency ${name} in ${path}`);
  }, exports, { log: () => {}, error: console.error });
  return exports;
}

const RELATIONS = new Set(["emailAttempts", "mailboxSends", "inboundEmails", "replies"]);
function matches(row: any, where: any): boolean {
  for (const [key, cond] of Object.entries(where ?? {})) {
    if (key === "OR") { if (!(cond as any[]).some((c) => matches(row, c))) return false; continue; }
    const value = row[key];
    if (RELATIONS.has(key)) { if ((value ?? []).length) return false; continue; }
    if (cond === null) { if (value !== null && value !== undefined) return false; continue; }
    if (cond instanceof Date) { if (!(value instanceof Date) || +value !== +cond) return false; continue; }
    if (cond && typeof cond === "object") {
      const c = cond as any;
      if ("not" in c && (c.not === null ? value == null : value === c.not)) return false;
      if ("lt" in c && !(value != null && +value < +c.lt)) return false;
      if ("gt" in c && !(value != null && +value > +c.gt)) return false;
      if ("lte" in c && !(value != null && +value <= +c.lte)) return false;
      if ("in" in c && !c.in.includes(value)) return false;
      continue;
    }
    if (value !== cond) return false;
  }
  return true;
}

const start = new Date(process.env.APPLICATION_ROLLOUT_START_AT!);
const freshAt = new Date(+start + 60_000);

function baseRow(id: string, extra: Record<string, unknown> = {}): any {
  return {
    id, userId: "u-" + id, jobId: "j-" + id, status: "queued", startedAt: null, leaseToken: null, completedAt: null,
    retryCount: 2, createdAt: freshAt, submitConfirmation: "NOT_SUBMITTED", sendStatus: "not_sent", sendFailureReason: null,
    errorMessage: null, submitStartedAt: null, submitClickPerformedAt: null, outboundSubmissionJson: null,
    destinationResponseJson: null, submissionReceiptJson: null, submittedAt: null, submittedVia: null,
    sentAt: null, sentProofType: null, sentProofRef: null, confirmedAt: null, canaryLog: null,
    answersUsedJson: null, answerContinuationJson: null, viewedAt: null, lastReplyAt: null, replyCount: 0,
    userStatus: null, cvDocxPath: "/tmp/cv.docx", cvPdfPath: "/tmp/cv.pdf", coverLetterPath: "/tmp/cl.txt",
    emailAttempts: [], mailboxSends: [], inboundEmails: [], replies: [],
    ...extra,
  };
}

function fakeDb(rows: any[], reservations: { applicationId: string; subjectKey: string }[] = []) {
  const application = {
    findMany: async ({ where }: any) => rows.filter((r) => matches(r, where)),
    count: async ({ where }: any) => rows.filter((r) => r.userId === where.userId && r.jobId === where.jobId && r.id !== where.id.not).length,
    updateMany: async ({ where, data }: any) => {
      const hits = rows.filter((r) => matches(r, where));
      for (const r of hits) Object.assign(r, data);
      return { count: hits.length };
    },
  };
  const applicationSubmissionReservation = {
    findFirst: async ({ where }: any) => reservations.find((r) => where.OR.some((c: any) =>
      (c.applicationId && c.applicationId === r.applicationId) || (c.subjectKey && c.subjectKey === r.subjectKey))) ?? null,
  };
  const tx = { application, applicationSubmissionReservation, $queryRaw: async () => [] };
  return { application, applicationSubmissionReservation, $transaction: async (fn: any) => fn(tx) };
}

const mod = load("src/lib/not-submitted-pickup.ts", {
  "@/lib/db": { prisma: {} },
  "@/lib/application-pause": { applicationsPaused: () => false },
  "@/lib/application-rollout": rollout,
  "@/lib/application-submission-budget": { submissionSubjectKey },
  "@/lib/drain-limits": drainLimits,
  "@/lib/queue-sendability": { HELD_MESSAGE_PREFIX: HELD, MAX_ATTEMPTS_MESSAGE_PREFIX: MAX_PREFIX },
  "@/lib/ats-skip-hosts": { SKIPPED_ATS_MANUAL_MESSAGE: "skip-list-handoff" },
  "@/lib/job-liveness": { JOB_LIVENESS_UNKNOWN_HELD_MESSAGE: "liveness-held" },
  "@/lib/application-recovery-release": { CONTROLLED_RELEASE_MESSAGE: CONTROLLED },
});

async function main() {
  // 1. Released NOT_SUBMITTED row (the Deblock shape) becomes pristine & claimable.
  {
    const rows = [baseRow("released")];
    const n = await mod.pickUpNeverSubmittedRows({ db: fakeDb(rows) });
    assert.equal(n, 1);
    assert.equal(rows[0].submitConfirmation, null, "claim requires submitConfirmation null");
    assert.equal(rows[0].cvDocxPath, null);
    assert.equal(rows[0].cvPdfPath, null);
    assert.equal(rows[0].coverLetterPath, null);
    assert.equal(rows[0].status, "queued");
    assert.equal(rows[0].startedAt, null);
    assert.equal(rows[0].retryCount, 2, "attempt count is preserved");
    // Idempotent.
    assert.equal(await mod.pickUpNeverSubmittedRows({ db: fakeDb(rows) }), 0);
  }
  // 1b. Row released by the stale-lease path keeps working (non-hold message).
  {
    const rows = [baseRow("stale", { errorMessage: "Riavviato: presa in carico scaduta dopo 20 minuti. Nessun invio iniziato." })];
    assert.equal(await mod.pickUpNeverSubmittedRows({ db: fakeDb(rows) }), 1);
    assert.equal(rows[0].submitConfirmation, null);
  }

  // 2. Any sign of a started submit (or other evidence) stays excluded.
  const blocked: Record<string, Record<string, unknown>> = {
    submitStartedAt: { submitStartedAt: new Date() },
    submitClick: { submitClickPerformedAt: new Date() },
    outbound: { outboundSubmissionJson: "{}" },
    destination: { destinationResponseJson: "{}" },
    receipt: { submissionReceiptJson: "{}" },
    submittedAt: { submittedAt: new Date() },
    submittedVia: { submittedVia: "portal_workable" },
    sentAt: { sentAt: new Date() },
    proof: { sentProofRef: "x", sentProofType: "ats_submission_receipt" },
    confirmed: { confirmedAt: new Date() },
    canary: { canaryLog: "{}" },
    answersUsed: { answersUsedJson: "[]" },
    continuation: { answerContinuationJson: "{}" },
    viewed: { viewedAt: new Date() },
    replied: { lastReplyAt: new Date(), replyCount: 1 },
    userStatus: { userStatus: "vista" },
    emailAttempt: { emailAttempts: [{ id: "a" }] },
    mailboxSend: { mailboxSends: [{ id: "m" }] },
    inbound: { inboundEmails: [{ id: "i" }] },
    reply: { replies: [{ id: "r" }] },
    unconfirmed: { submitConfirmation: "UNCONFIRMED" },
    nullConfirmation: { submitConfirmation: null },
    needsUser: { sendStatus: "needs_user" },
    exhausted: { retryCount: 3 },
    claimed: { startedAt: new Date() },
    leased: { leaseToken: "live" },
    completed: { completedAt: new Date() },
    notQueued: { status: "ready_to_apply" },
    historical: { createdAt: new Date(+start - 60_000) },
    controlledHold: { errorMessage: CONTROLLED },
    consentHold: { errorMessage: HELD + " consenso mancante" },
    maxAttemptsHold: { errorMessage: MAX_PREFIX + " 3 tentativi" },
    liveness: { errorMessage: "liveness-held" },
    skipList: { errorMessage: "skip-list-handoff" },
  };
  for (const [name, extra] of Object.entries(blocked)) {
    const rows = [baseRow(name, extra)];
    const before = JSON.stringify(rows[0]);
    assert.equal(await mod.pickUpNeverSubmittedRows({ db: fakeDb(rows) }), 0, `${name} must stay excluded`);
    assert.equal(JSON.stringify(rows[0]), before, `${name} must be untouched`);
    if (!["emailAttempt", "mailboxSend", "inbound", "reply", "historical"].includes(name)) {
      assert.equal(mod.neverSubmittedPickupEligible(rows[0]), false, `${name} predicate`);
    }
  }

  // 3. Submission-ledger reservation (by application or by user+job) blocks.
  {
    const rows = [baseRow("res-app")];
    assert.equal(await mod.pickUpNeverSubmittedRows({ db: fakeDb(rows, [{ applicationId: "res-app", subjectKey: "x" }]) }), 0);
    assert.equal(rows[0].submitConfirmation, "NOT_SUBMITTED");
    const rows2 = [baseRow("res-subject")];
    const key = submissionSubjectKey("u-res-subject", "j-res-subject");
    assert.equal(await mod.pickUpNeverSubmittedRows({ db: fakeDb(rows2, [{ applicationId: "other", subjectKey: key }]) }), 0);
    assert.equal(rows2[0].submitConfirmation, "NOT_SUBMITTED");
  }
  // 4. A sibling application for the same user+job blocks (dedup).
  {
    const rows = [baseRow("sib"), baseRow("sib-2", { userId: "u-sib", jobId: "j-sib", status: "ready_to_apply", submitConfirmation: "UNCONFIRMED" })];
    assert.equal(await mod.pickUpNeverSubmittedRows({ db: fakeDb(rows) }), 0);
    assert.equal(rows[0].submitConfirmation, "NOT_SUBMITTED");
  }
  // 5. Paused / not configured sends nothing.
  {
    const paused = load("src/lib/not-submitted-pickup.ts", {
      "@/lib/db": { prisma: {} }, "@/lib/application-pause": { applicationsPaused: () => true },
      "@/lib/application-rollout": rollout, "@/lib/application-submission-budget": { submissionSubjectKey },
      "@/lib/drain-limits": drainLimits,
      "@/lib/queue-sendability": { HELD_MESSAGE_PREFIX: HELD, MAX_ATTEMPTS_MESSAGE_PREFIX: MAX_PREFIX },
      "@/lib/ats-skip-hosts": { SKIPPED_ATS_MANUAL_MESSAGE: "s" }, "@/lib/job-liveness": { JOB_LIVENESS_UNKNOWN_HELD_MESSAGE: "l" },
      "@/lib/application-recovery-release": { CONTROLLED_RELEASE_MESSAGE: CONTROLLED },
    });
    const rows = [baseRow("paused")];
    assert.equal(await paused.pickUpNeverSubmittedRows({ db: fakeDb(rows) }), 0);
    assert.equal(rows[0].submitConfirmation, "NOT_SUBMITTED");
  }
  // 6. The drain wires the pickup after recovery and before the claim.
  {
    const drain = readFileSync("src/lib/queue-drain.ts", "utf8");
    const rec = drain.indexOf("recoverStuckApplications()");
    const pick = drain.indexOf("pickUpNeverSubmittedRows(");
    const find = drain.indexOf("await find(batch)");
    assert.ok(rec > 0 && pick > rec && find > pick, "pickup runs between recovery and claim");
  }
  console.log("not-submitted pickup: ok");
}

main().catch((err) => { console.error(err); process.exit(1); });
