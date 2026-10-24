import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as rollout from "../src/lib/application-rollout";
import * as cvTypes from "../src/lib/cv-profile-types";

/** CommonJS-transpile a module and resolve its imports from explicit mocks only. */
function load(path: string, mocks: Record<string, any>, strict = true): any {
  const js = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: any = {};
  new Function("require", "exports", js)((name: string) => {
    if (name in mocks) return mocks[name];
    if (strict) throw new Error(`unexpected dependency ${name} in ${path}`);
    return {};
  }, exports);
  return exports;
}

// ---- tiny Prisma-where evaluator (enough for the filters these modules use) ----
function matches(row: any, where: any): boolean {
  for (const [key, cond] of Object.entries(where ?? {})) {
    if (key === "OR") { if (!(cond as any[]).some((c) => matches(row, c))) return false; continue; }
    if (key === "AND") { if (!(cond as any[]).every((c) => matches(row, c))) return false; continue; }
    const value = row[key];
    if (key === "emailAttempts" && cond && typeof cond === "object" && "none" in (cond as any)) { if ((value ?? []).length) return false; continue; }
    if (cond === null) { if (value !== null && value !== undefined) return false; continue; }
    if (cond instanceof Date) { if (!(value instanceof Date) || +value !== +cond) return false; continue; }
    if (cond && typeof cond === "object") {
      const c = cond as any;
      if ("not" in c) { if (c.not === null ? value == null : value === c.not) return false; }
      if ("in" in c && !c.in.includes(value)) return false;
      if ("gt" in c && !(value instanceof Date && +value > +c.gt)) return false;
      if ("lte" in c && !(value instanceof Date && +value <= +c.lte)) return false;
      continue;
    }
    if (value !== cond) return false;
  }
  return true;
}

const HOUR = 3_600_000;
const NOW = new Date("2026-10-18T10:00:00.000Z");
const CUTOFF = new Date("2026-10-14T11:47:00.000Z");
process.env.APPLICATION_ROLLOUT_START_AT = CUTOFF.toISOString();
process.env.APPLICATION_RECOVERY_RELEASE = "on";
process.env.APPLICATION_RECOVERY_RELEASE_CAP = "20";
delete process.env.APPLICATION_SENDING_MODE;
delete process.env.APPLY_GLOBAL_DAILY_CAP;
delete process.env.APPLICATIONS_PAUSED;

const pause = { applicationsPaused: () => process.env.APPLICATIONS_PAUSED === "true" };
const budget = load("src/lib/application-submission-budget.ts", { "node:crypto": require("node:crypto"), "@/lib/application-rollout": rollout });
const gates = load("src/lib/application-worker-gates.ts", {
  "@/lib/application-rollout": rollout, "@/lib/application-pause": pause, "@/lib/application-submission-budget": budget,
  "@/lib/recruiter-email-send": { matchesApplicationEmailProofKey: () => false },
  "@/lib/application-recovery-release": load("src/lib/application-recovery-release.ts", {}, false),
  "@/lib/uncertain-submission": { blocksUncertainAutoRetry: () => false, UNCERTAIN_SUBMISSION_MESSAGE: "uncertain" },
}, false);
const LIVENESS = "Disponibilità dell'annuncio non verificabile: invio sospeso, nuovo controllo più tardi.";
const CLOSED = "Annuncio chiuso dall'azienda. Nessun invio effettuato.";
const closedJobs: string[] = [];
const liveness = { JOB_LIVENESS_UNKNOWN_HELD_MESSAGE: LIVENESS, JOB_CLOSED_HELD_MESSAGE: CLOSED,
  checkJobUrlLiveness: async () => { throw new Error("network must be injected"); }, markJobClosed: async (id: string) => { closedJobs.push(id); } };

function fakeDb(state: { apps: any[]; reservations: any[]; users: Record<string, any> }) {
  const updates: any[] = [];
  const application = {
    findMany: async ({ where, take }: any) => state.apps.filter((a) => matches(a, where)).slice(0, take ?? 1000)
      .map((a) => ({ ...a, user: state.users[a.userId], job: a.job })),
    count: async ({ where }: any) => state.apps.filter((a) => matches(a, where)).length,
    updateMany: async ({ where, data }: any) => {
      const hit = state.apps.filter((a) => matches(a, where));
      for (const a of hit) Object.assign(a, data);
      updates.push({ where, data, count: hit.length });
      return { count: hit.length };
    },
  };
  const reservationTable = { findFirst: async ({ where }: any) => state.reservations.find((r) => matches(r, where)) ?? null };
  const tx = { $queryRaw: async () => [], application, applicationSubmissionReservation: reservationTable };
  return {
    updates,
    db: { application, applicationSubmissionReservation: reservationTable,
      user: { findUnique: async ({ where }: any) => state.users[where.id] ?? null },
      $transaction: async (fn: any) => fn(tx) },
  };
}

const READY = { suspendedAt: null, privacyConsentAt: new Date("2026-10-16T00:00:00Z"), emailVerified: new Date("2026-10-16T00:00:00Z") };
function app(id: string, extra: Record<string, any> = {}) {
  return { id, userId: "u1", jobId: `job-${id}`, status: "queued", startedAt: new Date(+NOW - 3 * HOUR), completedAt: null,
    retryCount: 0, createdAt: new Date("2026-10-15T09:00:00Z"), consentGrantedAt: null,
    submittedAt: null, submittedVia: null, submissionReceiptJson: null, submitConfirmation: null, cvDocxPath: null,
    cvPdfPath: null, coverLetterPath: null, canaryLog: null, answersUsedJson: null, answerContinuationJson: null,
    viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null, emailAttempts: [], lastStatusCheckAt: null,
    errorMessage: gates.heldMessage("privacy_consent_missing"),
    job: { id: `job-${id}`, url: `https://boards.greenhouse.io/x/jobs/${id}`, closedAt: null }, ...extra };
}

async function testConsentRelease() {
  const recovery = load("src/lib/application-recovery-release.ts", {}, false);
  const rel = load("src/lib/held-application-release.ts", { "@/lib/db": { prisma: null }, "@/lib/application-pause": pause,
    "@/lib/application-rollout": rollout, "@/lib/application-submission-budget": budget, "@/lib/application-worker-gates": gates, "@/lib/job-liveness": liveness, "@/lib/application-recovery-release": recovery });
  const subject = budget.submissionSubjectKey("u1", "job-reserved-subject");
  const state = {
    users: { u1: { ...READY } } as Record<string, any>,
    reservations: [{ applicationId: "reserved", subjectKey: "x" }, { applicationId: "other", subjectKey: subject }],
    apps: [
      app("clean"),
      app("verification", { errorMessage: gates.heldMessage("email_verification_missing") }),
      app("prepared-not-submitted", { submitConfirmation: "NOT_SUBMITTED", cvDocxPath: "cv.docx", cvPdfPath: "cv.pdf", coverLetterPath: "cl.docx" }),
      app("ambiguous-docs", { cvDocxPath: "cv.docx" }),
      app("submitted", { submittedAt: new Date("2026-10-15T10:00:00Z") }),
      app("receipt", { submissionReceiptJson: "{}" }),
      app("email-attempt", { emailAttempts: [{ id: "e1", providerEmailId: null }] }),
      app("unconfirmed", { submitConfirmation: "UNCONFIRMED" }),
      app("canary", { canaryLog: "{}" }),
      app("reserved"),
      { ...app("reserved-subject"), jobId: "job-reserved-subject" },
      app("sibling-a", { jobId: "dup" }), app("sibling-b", { jobId: "dup", status: "success", startedAt: null, errorMessage: null }),
      app("pre-cutoff", { createdAt: new Date("2026-10-10T09:00:00Z") }),
      app("retried", { retryCount: 1 }),
      app("other-reason", { errorMessage: gates.heldMessage("billing_ineligible") }),
      app("liveness", { submitConfirmation: "NOT_SUBMITTED", errorMessage: LIVENESS }),
      app("unclaimed", { startedAt: null }),
      app("other-user", { userId: "u2" }),
      app("ready-to-apply", { status: "ready_to_apply" }),
    ],
  };
  state.users.u2 = { ...READY };
  const { db } = fakeDb(state);
  const byId = (id: string) => state.apps.find((a) => a.id === id)!;

  // Not ready: missing consent / unverified / suspended → nothing moves.
  for (const blocker of [{ privacyConsentAt: null }, { emailVerified: null }, { suspendedAt: new Date() }]) {
    state.users.u1 = { ...READY, ...blocker };
    assert.equal(await rel.releaseHeldApplicationsForUser("u1", "privacy_consent", db, NOW), 0);
  }
  state.users.u1 = { ...READY };
  process.env.APPLICATIONS_PAUSED = "true";
  assert.equal(await rel.releaseHeldApplicationsForUser("u1", "privacy_consent", db, NOW), 0);
  delete process.env.APPLICATIONS_PAUSED;
  process.env.APPLY_GLOBAL_DAILY_CAP = "0";
  assert.equal(await rel.releaseHeldApplicationsForUser("u1", "privacy_consent", db, NOW), 0, "closed config releases nothing");
  delete process.env.APPLY_GLOBAL_DAILY_CAP;

  const released = await rel.releaseHeldApplicationsForUser("u1", "privacy_consent", db, NOW);
  assert.equal(released, 3);
  for (const id of ["clean", "verification", "prepared-not-submitted"]) {
    const row = byId(id);
    assert.equal(row.startedAt, null, id); assert.equal(row.errorMessage, null, id); assert.equal(row.submitConfirmation, null, id);
    assert.equal(row.status, "queued", id);
  }
  assert.equal(byId("prepared-not-submitted").cvDocxPath, null, "unsent prepared docs restart from scratch");
  for (const id of ["ambiguous-docs", "submitted", "receipt", "email-attempt", "unconfirmed", "canary", "reserved", "reserved-subject",
    "sibling-a", "pre-cutoff", "retried", "other-reason", "liveness"]) {
    assert.notEqual(byId(id).startedAt, null, `${id} must stay held`);
  }
  assert.equal(byId("other-user").startedAt === null, false, "other users untouched");
  assert.equal(byId("ready-to-apply").status, "ready_to_apply");
  // Idempotent.
  assert.equal(await rel.releaseHeldApplicationsForUser("u1", "privacy_consent", db, NOW), 0);
  state.apps.push(app("needs-user", { status: "needs_user", errorMessage: gates.heldMessage("privacy_consent_missing") }));
  assert.equal(await rel.releaseHeldApplicationsForUser("u1", "privacy_consent", db, NOW), 1);
  assert.equal(byId("needs-user").status, "queued");
  assert.equal(byId("needs-user").sendStatus, "not_sent");

  // Profile trigger only releases profile holds.
  state.apps.push(app("profile-held", { errorMessage: gates.heldMessage("profile_unverified") }));
  assert.equal(await rel.releaseHeldApplicationsForUser("u1", "privacy_consent", db, NOW), 0);
  assert.equal(await rel.releaseHeldApplicationsForUser("u1", "cv_profile_created", db, NOW), 1);
  // A failing DB never throws into the caller's request.
  const broken = { ...db, user: { findUnique: async () => { throw new Error("outage"); } } };
  assert.equal(await rel.releaseHeldApplicationsForUser("u1", "privacy_consent", broken, NOW), 0);
  console.log("PASS held release: consent/verification/profile holds released only with zero prior-submission evidence, no ledger/sibling, after cutoff; paused/closed/unready → none.");
}

async function testLivenessRecheck() {
  const recovery = load("src/lib/application-recovery-release.ts", {}, false);
  const rel = load("src/lib/held-application-release.ts", { "@/lib/db": { prisma: null }, "@/lib/application-pause": pause,
    "@/lib/application-rollout": rollout, "@/lib/application-submission-budget": budget, "@/lib/application-worker-gates": gates, "@/lib/job-liveness": liveness, "@/lib/application-recovery-release": recovery });

  // Backoff schedule: bounded number of checks inside the window.
  let checks = 0;
  let row: any = { startedAt: new Date(+NOW), lastStatusCheckAt: null };
  for (let t = 0; t <= 48 * HOUR; t += 15 * 60_000) {
    const at = new Date(+NOW + t);
    const due = rel.livenessRecheckDue(row, at);
    if (due === "exhausted") break;
    if (due === "check") { checks++; row = { startedAt: at, lastStatusCheckAt: row.lastStatusCheckAt ?? at }; }
  }
  assert.ok(checks >= 3 && checks <= 5, `bounded checks, got ${checks}`);
  assert.equal(rel.livenessRecheckDue({ startedAt: new Date(+NOW - HOUR), lastStatusCheckAt: null }, NOW), "wait");
  assert.equal(rel.livenessRecheckDue({ startedAt: new Date(+NOW - HOUR), lastStatusCheckAt: new Date(+NOW - 13 * HOUR) }, NOW), "exhausted");

  const held = (id: string, extra: Record<string, any> = {}) => app(id, { submitConfirmation: "NOT_SUBMITTED", errorMessage: LIVENESS, ...extra });
  const state = {
    users: { u1: { ...READY }, u2: { ...READY, privacyConsentAt: null } } as Record<string, any>,
    reservations: [{ applicationId: "live-but-reserved", subjectKey: "x" }],
    apps: [
      held("live"), held("closed"), held("unknown"), held("too-soon", { startedAt: new Date(+NOW - HOUR) }),
      held("exhausted", { lastStatusCheckAt: new Date(+NOW - 13 * HOUR) }),
      held("already-closed-job", { job: { id: "job-already-closed-job", url: "u", closedAt: new Date("2026-10-17T00:00:00Z") } }),
      held("live-but-reserved"), held("submitted", { submittedVia: "email_recruiter" }),
      held("email-attempt", { emailAttempts: [{ id: "a" }] }), held("unready-user", { userId: "u2" }),
      held("other-message", { errorMessage: gates.heldMessage("privacy_consent_missing") }),
    ],
  };
  const { db } = fakeDb(state);
  const byId = (id: string) => state.apps.find((a) => a.id === id)!;
  const requested: string[] = [];
  const check = async (url: string) => {
    requested.push(url);
    if (url.endsWith("/live") || url.endsWith("/live-but-reserved")) return { state: "live" as const };
    if (url.endsWith("/closed")) return { state: "closed" as const };
    return { state: "unknown" as const };
  };
  closedJobs.length = 0;
  const report = await rel.recheckLivenessHeldApplications({ db, now: NOW, check, markClosed: liveness.markJobClosed });
  assert.equal(report.released, 2, "live and unknown both proceed");
  assert.equal(byId("live").startedAt, null); assert.equal(byId("live").submitConfirmation, null); assert.equal(byId("live").errorMessage, null);
  assert.equal(byId("unknown").startedAt, null); assert.equal(byId("unknown").errorMessage, null);
  assert.ok((byId("live").lastStatusCheckAt as unknown) instanceof Date, "first check recorded for backoff bound");
  assert.equal(byId("closed").status, "failed"); assert.equal(byId("closed").submitConfirmation, "JOB_CLOSED");
  assert.equal(byId("already-closed-job").status, "failed");
  assert.deepEqual(closedJobs, ["job-closed"]);
  assert.equal(report.closed, 2);
  assert.equal(byId("exhausted").errorMessage, rel.LIVENESS_RECHECK_EXHAUSTED_MESSAGE);
  assert.equal(report.exhausted, 1);
  for (const id of ["too-soon", "live-but-reserved", "submitted", "email-attempt", "unready-user", "other-message"]) {
    assert.notEqual(byId(id).startedAt, null, `${id} stays held`); assert.equal(byId(id).status, "queued", id);
  }
  assert.ok(!requested.some((u) => /submitted|email-attempt|unready-user|too-soon|other-message|already-closed/.test(u)), "no network for ineligible rows");
  // Exhausted rows are never picked again.
  const again = await rel.recheckLivenessHeldApplications({ db, now: new Date(+NOW + 30 * HOUR), check, markClosed: liveness.markJobClosed });
  assert.equal(byId("exhausted").errorMessage, rel.LIVENESS_RECHECK_EXHAUSTED_MESSAGE);
  assert.equal(byId("too-soon").startedAt, null, "later unknown/live holds are released when due");
  assert.ok(again.released >= 1);
  process.env.APPLICATIONS_PAUSED = "true";
  assert.deepEqual(await rel.recheckLivenessHeldApplications({ db, now: NOW, check }), { checked: 0, released: 0, closed: 0, stillUnknown: 0, exhausted: 0 });
  delete process.env.APPLICATIONS_PAUSED;
  const leftover = held("still-unverified", { startedAt: new Date(+NOW - HOUR) });
  leftover.errorMessage = LIVENESS;
  leftover.submitConfirmation = "NOT_SUBMITTED";
  state.apps.push(leftover);
  const unverifiable = await rel.releaseUnverifiableLivenessHolds({ db, now: NOW });
  assert.ok(unverifiable >= 1);
  assert.equal(byId("still-unverified").startedAt, null);
  assert.equal(byId("exhausted").startedAt, null, "exhausted unverifiable holds also re-enter admission");
  console.log("PASS liveness recheck: backoff bounded (≤5 checks/12h), closed → JOB_CLOSED + job closed, live/unknown → fenced release, evidence/ledger/unready rows untouched, paused → no-op.");
}

async function testCvProfileEnsure() {
  const releasedFor: string[] = [];
  const ensure = load("src/lib/cv-profile-ensure.ts", { "@/lib/db": { prisma: null }, "@/lib/admin": { isTestAccount: (e: string) => e.endsWith("@test.invalid") },
    "@/lib/cv-profile-ai-full": { extractFullProfile: async () => { throw new Error("must be injected"); } },
    "@/lib/cv-profile-types": cvTypes, "@/lib/held-application-release": { releaseHeldApplicationsForUser: async () => 0 } });
  const TEXT = "Mario Rossi — Backend Engineer. Esperienza: 5 anni Node.js, PostgreSQL, Kubernetes presso Acme.";
  const state: any = {
    profiles: {} as Record<string, any>,
    docs: { u1: { extractedText: TEXT, parsedProfileJson: null }, u2: { extractedText: TEXT, parsedProfileJson: JSON.stringify({ firstName: "Anna", title: "Data Analyst" }) },
      u3: { extractedText: "short", parsedProfileJson: null }, u4: { extractedText: TEXT, parsedProfileJson: null } },
    users: { u1: { email: "u1@example.invalid", suspendedAt: null }, u2: { email: "u2@example.invalid", suspendedAt: null },
      u3: { email: "u3@example.invalid", suspendedAt: null }, u4: { email: "qa@test.invalid", suspendedAt: null },
      u5: { email: "u5@example.invalid", suspendedAt: null } },
  };
  let createFails: string | null = null;
  const db = {
    cVProfile: {
      findUnique: async ({ where }: any) => state.profiles[where.userId] ?? null,
      create: async ({ data }: any) => {
        if (createFails) { const e: any = new Error("dup"); e.code = createFails; throw e; }
        state.profiles[data.userId] = { ...data, updatedAt: new Date(1) }; return state.profiles[data.userId];
      },
      updateMany: async ({ where, data }: any) => {
        const p = state.profiles[where.userId];
        if (!p || +p.updatedAt !== +where.updatedAt) return { count: 0 };
        Object.assign(p, data, { updatedAt: new Date(+p.updatedAt + 1) }); return { count: 1 };
      },
    },
    cVDocument: { findFirst: async ({ where }: any) => state.docs[where.userId] ?? null },
    user: {
      findUnique: async ({ where }: any) => state.users[where.id] ? { ...state.users[where.id] } : null,
      findMany: async () => Object.entries(state.users).filter(([id]) => state.docs[id]).map(([id, u]: any) => ({ id, email: u.email, cvProfile: state.profiles[id] ?? null })),
    },
  };
  const full = { ...cvTypes.EMPTY_PROFILE, firstName: "Mario", lastName: "Rossi", title: "Backend Engineer", skills: [{ name: "Node.js" }] };
  let extractCalls = 0;
  const extract = async (text: string) => { extractCalls++; assert.equal(text, TEXT); return { ...full }; };
  const releaseHeld = async (id: string) => { releasedFor.push(id); return 1; };

  assert.equal(await ensure.ensureCvProfileFromUpload("u1", { db, extract, releaseHeld }), "created");
  assert.equal(state.profiles.u1.title, "Backend Engineer");
  assert.equal(state.profiles.u1.email, "u1@example.invalid", "email prefilled like /cv");
  assert.deepEqual(Object.keys(state.profiles.u1).filter((k) => /verif/i.test(k)), [], "nothing marked verified");
  assert.deepEqual(releasedFor, ["u1"]);
  // Existing content is never overwritten, even if the user edited it.
  state.profiles.u1.title = "User edited";
  assert.equal(await ensure.ensureCvProfileFromUpload("u1", { db, extract, releaseHeld }), "exists");
  assert.equal(state.profiles.u1.title, "User edited");
  // Empty extraction never writes an empty row; quick upload profile is the fallback.
  const empty = async () => ({ ...cvTypes.EMPTY_PROFILE });
  assert.equal(await ensure.ensureCvProfileFromUpload("u5", { db, extract: empty, releaseHeld }), "no_cv");
  state.docs.u5 = { extractedText: TEXT, parsedProfileJson: null };
  assert.equal(await ensure.ensureCvProfileFromUpload("u5", { db, extract: empty, releaseHeld }), "empty_extraction");
  assert.equal(state.profiles.u5, undefined);
  assert.equal(await ensure.ensureCvProfileFromUpload("u2", { db, extract: empty, releaseHeld }), "created");
  assert.equal(state.profiles.u2.firstName, "Anna"); assert.equal(state.profiles.u2.title, "Data Analyst");
  assert.equal(await ensure.ensureCvProfileFromUpload("u3", { db, extract, releaseHeld }), "no_cv");
  // Empty pre-existing row is filled (compare-and-set); a concurrent create race yields "exists".
  state.profiles.u5 = { userId: "u5", ...cvTypes.profileToRow(cvTypes.EMPTY_PROFILE), updatedAt: new Date(7) };
  assert.equal(await ensure.ensureCvProfileFromUpload("u5", { db, extract, releaseHeld }), "filled");
  delete state.profiles.u5; createFails = "P2002";
  assert.equal(await ensure.ensureCvProfileFromUpload("u5", { db, extract, releaseHeld }), "exists");
  createFails = "P1001";
  assert.equal(await ensure.ensureCvProfileFromUpload("u5", { db, extract, releaseHeld }), "error", "never throws");
  createFails = null;
  // Names-only profile is created but does not release profile holds (worker gate still needs content).
  releasedFor.length = 0;
  delete state.profiles.u5;
  assert.equal(await ensure.ensureCvProfileFromUpload("u5", { db, extract: async () => ({ ...cvTypes.EMPTY_PROFILE, firstName: "Solo" }), releaseHeld }), "created");
  assert.deepEqual(releasedFor, []);
  state.users.u5.suspendedAt = new Date();
  assert.equal(await ensure.ensureCvProfileFromUpload("u5", { db, extract, releaseHeld }), "skipped");

  // Backfill: bounded, skips test accounts and profiles with content, no 5-per-run cap.
  for (let i = 0; i < 12; i++) {
    state.users[`b${i}`] = { email: `b${i}@example.invalid`, suspendedAt: null };
    state.docs[`b${i}`] = { extractedText: TEXT, parsedProfileJson: null };
  }
  extractCalls = 0;
  const first = await ensure.backfillMissingCvProfiles({ db, extract, max: 8, random: () => 0.5, releaseHeld });
  assert.equal(first.created + first.noCv, 8); assert.equal(first.deferred, first.candidates - 8);
  assert.equal(first.candidates, 13, "12 new users + one unparseable CV; test account excluded");
  assert.equal(state.profiles.u4, undefined, "test accounts skipped");
  const second = await ensure.backfillMissingCvProfiles({ db, extract, max: 50, releaseHeld });
  assert.equal(second.candidates, first.candidates - first.created);
  for (let i = 0; i < 12; i++) assert.ok(state.profiles[`b${i}`], `b${i} created`);
  const third = await ensure.backfillMissingCvProfiles({ db, extract, max: 50, releaseHeld });
  assert.equal(third.created + third.filled, 0, "idempotent");
  console.log("PASS CV profile ensure/backfill: same seed as /cv, never overwrites content or writes empty rows, CAS/race safe, bounded uncapped-by-5 backfill, idempotent.");
}

async function main() {
  await testConsentRelease();
  await testLivenessRecheck();
  await testCvProfileEnsure();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
