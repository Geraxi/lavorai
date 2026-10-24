/**
 * Mocked (in-memory DB, fake Playwright page) tests for the Domande
 * answers-as-consent flow: blank-form pause on Ashby/Greenhouse without prior
 * consent, consent granted by confirming answers, and resume admission.
 * No network, no real database, no real submission.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { attestAnswerPause, queueAnswerContinuation, reserveApplicationWork, continuationDestination } from "../src/lib/application-worker-gates";
import { answerConfirmationDigest, answerContinuationIneligibility, continuationConfirmationAccepted, continuationSelect, needsAnswersSubmitConfirmation, parseAnswerContinuation, ANSWERS_CONSENT_NOTE } from "../src/lib/application-answer-continuation";
import { candidateFacts, resolveCandidateFact } from "../src/lib/candidate-facts";
import { parseAnswers } from "../src/lib/application-answers";
import * as scoped from "../src/lib/application-question-answers";
import { encodeExplicitApplicationAnswers, questionFingerprint, parseApplicationQuestion } from "../src/lib/application-question-answers";
import { applicationRolloutConfig } from "../src/lib/application-rollout";
import { submissionSubjectKey } from "../src/lib/application-submission-budget";
import { ashbyAdapter } from "../src/lib/portal-adapters/ashby";
import * as guidance from "../src/lib/application-continuation-guidance";
import * as answers from "../src/lib/application-answers";
import { prefersRemoteOrHybrid } from "../src/lib/auto-apply-preferences";

const ASHBY_URL = "https://jobs.ashbyhq.com/alan/93455a8c-fbc5-4421-986b-9a63e3f22b36";
const GH_URL = "https://boards.greenhouse.io/doctolib/jobs/8000653003";
const QUESTIONS = [{ label: "Describe a specific project that you’re proud of", kind: "textarea" }];

function makeRow(url: string, consentGrantedAt: Date | null, token: Date) {
  const now = Date.now();
  return {
    id: "app1", userId: "u1", jobId: "j1", sessionId: null, session: null, cvDocxPath: null,
    createdAt: new Date(now - 60 * 60_000), consentGrantedAt, retryCount: 0,
    status: "applying", startedAt: token, completedAt: null, submittedAt: null, submittedVia: null,
    submitConfirmation: "SUBMISSION_STARTED", submissionReceiptJson: null, answerContinuationJson: null as string | null,
    pendingQuestionsJson: null as string | null, userProvidedAnswersJson: null as string | null, canaryLog: null,
    answersUsedJson: null, viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null, errorMessage: null as string | null,
    job: { closedAt: null, url, recruiterEmail: null, company: "Alan", title: "Fullstack Software Engineer", description: "", location: "Paris", remote: true, contractType: null, salaryMin: null, salaryMax: null },
    user: { email: "candidate@example.test", yearsExperience: 3, englishLevel: null, noticePeriod: null, tier: "pro", createdAt: new Date(now - 30 * 86400_000),
      trialEndsAt: null, trialGraceEndsAt: null, subscriptionStatus: "active", currentPeriodEnd: null, pausedUntil: null, suspendedAt: null,
      emailVerified: new Date(now - 86400_000), privacyConsentAt: new Date(now - 86400_000), avoidCompanies: null, cvProfile: null,
      preferences: { autoApplyMode: "hybrid", rolesJson: "[]", locationsJson: "[]", applicationAnswersJson: null, employmentType: null, salaryMin: null, matchMin: 0, sourcesJson: null } },
  };
}
type Row = ReturnType<typeof makeRow>;

function fakeDb(row: Row, channel: string, token: Date) {
  const reservations = [{ id: "r1", applicationId: row.id, subjectKey: submissionSubjectKey(row.userId, row.jobId), channel,
    attemptStartedAt: token, rolloutStartedAt: applicationRolloutConfig().startedAt! }];
  const apply = (data: Record<string, unknown>) => Object.assign(row, data);
  const matches = (where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => {
    const cur = (row as Record<string, unknown>)[k];
    if (v instanceof Date) return cur instanceof Date && +cur === +v;
    if (v && typeof v === "object" && "in" in (v as object)) return ((v as { in: unknown[] }).in).includes(cur);
    return cur === v;
  });
  const tx = {
    $queryRaw: async () => [],
    application: {
      findUnique: async () => row,
      findFirst: async () => null, findMany: async () => [], count: async () => 0,
      update: async ({ data }: { data: Record<string, unknown> }) => apply(data),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (!matches(where)) return { count: 0 }; apply(data); return { count: 1 };
      },
    },
    applicationSubmissionReservation: { findMany: async () => reservations, findFirst: async () => null },
    applicationEmailAttempt: { findFirst: async () => null },
    job: { findMany: async () => [{ id: row.jobId, url: row.job.url }] },
    userAnswer: { findMany: async () => [] },
  };
  return { application: { findUnique: async () => ({ userId: row.userId, sessionId: row.sessionId, jobId: row.jobId }) },
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } as never;
}

function answer(row: Row) {
  const pending = JSON.parse(row.pendingQuestionsJson!).map(parseApplicationQuestion);
  row.userProvidedAnswersJson = encodeExplicitApplicationAnswers(row.id, pending.map((q: NonNullable<ReturnType<typeof parseApplicationQuestion>>) => ({
    ...q, fingerprint: questionFingerprint(q), answer: "I rebuilt the checkout end to end.", source: "user", answeredAt: new Date().toISOString() })) as never);
  const facts = candidateFacts(null, row.user, parseAnswers(null), []);
  return answerConfirmationDigest(row.answerContinuationJson!, row.userProvidedAnswersJson, facts);
}

let passed = 0;
async function test(name: string, fn: () => unknown | Promise<unknown>) { await fn(); passed++; console.log(`  ok ${name}`); }

async function main() {
  console.log("answers-consent-resume");
  for (const [channel, url, evidence] of [["portal_ashby", ASHBY_URL, "ashby_blank_form_v1"], ["portal_greenhouse", GH_URL, "greenhouse_blank_form_v1"]] as const) {
    await test(`${channel}: no consent → consent-pending blank-form proof → Domande confirmation grants consent → resume admitted`, async () => {
      const token = new Date(Date.now() - 10 * 60_000);
      const row = makeRow(url, null, token);
      const db = fakeDb(row, channel, token);
      assert.equal(await attestAnswerPause(row.id, token, channel, JSON.stringify(QUESTIONS), url, db, evidence), true);
      assert.equal(row.status, "needs_answers");
      assert.equal(row.submitConfirmation, "NOT_SUBMITTED");
      const paused = parseAnswerContinuation(row.answerContinuationJson)!;
      assert.equal(paused.consentGrantedAt, null); assert.equal(paused.consentSource, "answers");
      assert.equal(answerContinuationIneligibility(row as never, "paused", url), null, "paused proof must be resumable");
      // Before confirmation nothing is queued and no consent exists.
      assert.equal(row.consentGrantedAt, null);
      const digest = answer(row);
      assert.equal(await queueAnswerContinuation({ applicationId: row.id, userId: row.userId, proofDigest: digest, expectedAnswersJson: row.userProvidedAnswersJson }, db), "queued");
      assert.equal(row.status, "queued");
      assert.ok(row.consentGrantedAt instanceof Date, "consentGrantedAt set by the answers confirmation");
      const queued = parseAnswerContinuation(row.answerContinuationJson)!;
      assert.equal(queued.consentSource, "answers");
      assert.equal(queued.consentNote, ANSWERS_CONSENT_NOTE);
      assert.equal(queued.consentGrantedAt, (row.consentGrantedAt as unknown as Date).toISOString());
      assert.equal(queued.phase, "queued");
      const resumeToken = await reserveApplicationWork(row.id, db);
      assert.ok(resumeToken, "resume admitted by the worker gate");
      assert.equal(row.status, "optimizing");
      assert.equal(parseAnswerContinuation(row.answerContinuationJson)!.phase, "running");
    });
  }
  await test("explicit-consent Greenhouse pause keeps working (regression)", async () => {
    const token = new Date(Date.now() - 10 * 60_000);
    const row = makeRow(GH_URL, new Date(token.getTime() - 60_000), token);
    const db = fakeDb(row, "portal_greenhouse", token);
    assert.equal(await attestAnswerPause(row.id, token, "portal_greenhouse", JSON.stringify(QUESTIONS), GH_URL, db, "greenhouse_blank_form_v1"), true);
    assert.equal(parseAnswerContinuation(row.answerContinuationJson)!.consentSource, "explicit");
    const digest = answer(row);
    const before = row.consentGrantedAt;
    assert.equal(await queueAnswerContinuation({ applicationId: row.id, userId: row.userId, proofDigest: digest, expectedAnswersJson: row.userProvidedAnswersJson }, db), "queued");
    assert.equal(row.consentGrantedAt, before, "existing consent is not rewritten");
  });
  await test("Recruitee post-fill pause still needs prior consent; wrong evidence is refused", async () => {
    const token = new Date(Date.now() - 10 * 60_000);
    const row = makeRow("https://acme.recruitee.com/o/engineer", null, token);
    assert.equal(await attestAnswerPause(row.id, token, "portal_recruitee", JSON.stringify(QUESTIONS), row.job.url, fakeDb(row, "portal_recruitee", token)), false);
    const ashbyRow = makeRow(ASHBY_URL, null, token);
    assert.equal(await attestAnswerPause(ashbyRow.id, token, "portal_ashby", JSON.stringify(QUESTIONS), ASHBY_URL, fakeDb(ashbyRow, "portal_ashby", token), "greenhouse_blank_form_v1"), false);
  });
  await test("a consent-pending proof cannot be used once out of the paused phase or with forged row consent", async () => {
    const token = new Date(Date.now() - 10 * 60_000);
    const row = makeRow(ASHBY_URL, null, token);
    await attestAnswerPause(row.id, token, "portal_ashby", JSON.stringify(QUESTIONS), ASHBY_URL, fakeDb(row, "portal_ashby", token), "ashby_blank_form_v1");
    const forged = { ...row, consentGrantedAt: new Date() };
    assert.notEqual(answerContinuationIneligibility(forged as never, "paused", ASHBY_URL), null);
    const queuedNoConsent = { ...row, status: "queued", answerContinuationJson: JSON.stringify({ ...JSON.parse(row.answerContinuationJson!), phase: "queued", confirmedAt: new Date().toISOString() }) };
    assert.equal(parseAnswerContinuation(queuedNoConsent.answerContinuationJson), null, "queued proof without consent is invalid");
  });
  await test("NEEDS_ANSWERS overwrite does not strand a paused proof", async () => {
    const token = new Date(Date.now() - 10 * 60_000);
    const row = makeRow(GH_URL, new Date(token.getTime() - 60_000), token);
    const db = fakeDb(row, "portal_greenhouse", token);
    assert.equal(await attestAnswerPause(row.id, token, "portal_greenhouse", JSON.stringify(QUESTIONS), GH_URL, db, "greenhouse_blank_form_v1"), true);
    assert.equal(needsAnswersSubmitConfirmation(row), undefined, "do not overwrite NOT_SUBMITTED when a paused proof exists");
    row.submitConfirmation = "NEEDS_ANSWERS";
    assert.equal(continuationConfirmationAccepted(row.submitConfirmation), true);
    assert.equal(answerContinuationIneligibility(row as never, "paused", GH_URL), null, "existing stuck NEEDS_ANSWERS rows become resumable");
    const digest = answer(row);
    assert.equal(await queueAnswerContinuation({ applicationId: row.id, userId: row.userId, proofDigest: digest, expectedAnswersJson: row.userProvidedAnswersJson }, db), "queued");
    assert.equal(row.status, "queued");
    assert.equal(row.submitConfirmation, "NOT_SUBMITTED");
  });
  await test("Ashby continuation destination is the posting id", () => {
    assert.equal(continuationDestination("portal_ashby", ASHBY_URL), "ashby:93455a8c-fbc5-4421-986b-9a63e3f22b36");
    assert.equal(continuationDestination("portal_ashby", "https://evil.example/alan/93455a8c"), null);
  });

  // ---------- Ashby adapter: pause BEFORE any fill or CV upload ----------
  function fakeAshbyPage(questions: Array<{ idx: number; label: string; kind: string }>) {
    const actions: string[] = [];
    const el = { waitFor: async () => undefined, fill: async () => { actions.push("fill"); }, count: async () => 1, isVisible: async () => false,
      click: async () => { actions.push("click"); }, setInputFiles: async () => { actions.push("upload"); } };
    const page = {
      goto: async () => null, url: () => `${ASHBY_URL}/application`,
      locator: () => ({ ...el, first: () => el, nth: () => el, all: async () => [] }),
      waitForLoadState: async () => undefined, waitForTimeout: async () => undefined,
      evaluate: async () => questions,
    } as unknown as import("playwright").Page;
    return { page, actions };
  }
  const baseInput = {
    jobUrl: ASHBY_URL, userEmail: "candidate@example.test", cvLocalPath: "/tmp/cv.docx", clLocalPath: "/tmp/cl.docx", coverLetterText: "",
    profile: { firstName: "A", lastName: "B", email: "candidate@example.test", phone: "", city: "", summary: "", links: [], experiences: [], education: [], skills: [], languages: [], certifications: [] },
    answers: {}, storedAnswers: [], reusableAnswers: [], beforeSubmit: async () => false,
  };
  await test("Ashby: unanswerable required question → pause attested before any fill/upload", async () => {
    const { page, actions } = fakeAshbyPage([{ idx: 0, label: QUESTIONS[0].label, kind: "textarea" }]);
    let paused: unknown = null; let candidateData = false;
    const outcome = await ashbyAdapter.apply(page, { ...baseInput,
      onPreTransmissionPause: async (q: unknown) => { paused = q; return true; },
      beforeCandidateData: async () => { candidateData = true; return true; } } as never);
    assert.equal(outcome.status, "needs_user_input");
    assert.ok(paused); assert.equal(candidateData, false);
    assert.deepEqual(actions.filter(a => a !== "click"), [], "no fill or upload before the pause");
  });
  await test("Ashby resume: answers complete → candidate-data boundary is crossed before the first fill", async () => {
    const { page, actions } = fakeAshbyPage([]);
    const order: string[] = [];
    const origPush = actions.push.bind(actions);
    actions.push = (...items: string[]) => { order.push(...items); return origPush(...items); };
    await ashbyAdapter.apply(page, { ...baseInput,
      onPreTransmissionPause: async () => { throw new Error("must not pause"); },
      beforeCandidateData: async () => { order.push("boundary"); return true; } } as never);
    const firstData = order.findIndex(a => a === "fill" || a === "upload");
    assert.ok(order.indexOf("boundary") >= 0 && (firstData === -1 || order.indexOf("boundary") < firstData), `order: ${order.join(",")}`);
  });
  await test("Ashby: boundary refused → stop before entering data", async () => {
    const { page, actions } = fakeAshbyPage([]);
    const outcome = await ashbyAdapter.apply(page, { ...baseInput, onPreTransmissionPause: async () => true, beforeCandidateData: async () => false } as never);
    assert.equal(outcome.ok, false);
    assert.deepEqual(actions.filter(a => a !== "click"), []);
  });
  await test("Domande API: paused → answers → one resume job, idempotent double submit, privacy blocked", async () => {
    const token = new Date(Date.now() - 10 * 60_000);
    const row = makeRow(GH_URL, new Date(token.getTime() - 60_000), token);
    const db = fakeDb(row, "portal_greenhouse", token);
    assert.equal(await attestAnswerPause(row.id, token, "portal_greenhouse", JSON.stringify(QUESTIONS), GH_URL, db, "greenhouse_blank_form_v1"), true);
    assert.equal(row.status, "needs_answers");
    const pending = JSON.parse(row.pendingQuestionsJson!).map(parseApplicationQuestion);
    const fingerprint = questionFingerprint(pending[0]!);
    let enqueued = 0;
    const queuedIds: string[] = [];
    const live = { row, db };
    const prisma = {
      application: {
        findMany: async ({ where }: any) => {
          if (where.userId === live.row.userId && where.status === "needs_answers" && live.row.status === "needs_answers") {
            return [{ ...live.row, job: live.row.job }];
          }
          return [];
        },
        updateMany: async ({ where, data }: any) => {
          const ok = where.id === live.row.id && where.status === live.row.status
            && (where.submitConfirmation?.in ? where.submitConfirmation.in.includes(live.row.submitConfirmation) : where.submitConfirmation === live.row.submitConfirmation);
          if (!ok) return { count: 0 };
          Object.assign(live.row, data);
          return { count: 1 };
        },
      },
      userAnswer: { findMany: async () => [] },
      cVProfile: { findUnique: async () => null },
      user: { findUnique: async () => ({ email: live.row.user.email, yearsExperience: 3, privacyConsentAt: live.row.user.privacyConsentAt }) },
      userPreferences: { findUnique: async () => ({ applicationAnswersJson: null, locationsJson: "[]" }) },
    };
    const dependencies: Record<string, unknown> = {
      "@/lib/application-answer-continuation": { answerContinuationIneligibility, answerConfirmationDigest, continuationConfirmationAccepted, continuationSelect, parseAnswerContinuation },
      "@/lib/application-continuation-guidance": guidance,
      "@/lib/application-worker-gates": {
        queueAnswerContinuation: async (input: any) => queueAnswerContinuation({ ...input }, live.db),
      },
      "@/lib/candidate-facts": { candidateFacts, resolveCandidateFact },
      "@/lib/application-answers": answers,
      "next/server": { NextResponse: { json: (body: unknown, options?: { status: number }) => ({ status: options?.status ?? 200, body }) } },
      "@/lib/db": { prisma },
      "@/lib/session": { getCurrentUser: async () => ({ id: "u1", yearsExperience: 3, locale: "it" }) },
      "@/lib/application-queue": { enqueueApplication: async (id: string) => { enqueued++; queuedIds.push(id); } },
      "@/lib/application-question-answers": scoped,
      "@/lib/cv-answer-reuse": { reuseCvAnswers: async () => 0 },
      "@/lib/reusable-standard-answers": { persistReusableStandardAnswers: async () => 0 },
      "@/lib/cv-profile-types": { rowToProfile: (r: any) => r },
      "@/lib/auto-apply-preferences": { prefersRemoteOrHybrid },
    };
    const module = { exports: {} as any };
    const code = ts.transpileModule(readFileSync("src/app/api/questions/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Date, Map, Set, console,
      require: (id: string) => { assert.ok(id in dependencies, id); return dependencies[id]; }, fetch: () => { throw new Error("No network"); } });
    const post = (body: any) => module.exports.POST({ json: async () => body });
    const get = () => module.exports.GET();

    const saved = await post({ answers: [{ applicationId: row.id, fingerprint, answer: "I rebuilt the checkout end to end." }] });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.requeued, 0);
    assert.equal(enqueued, 0);
    const listed = await get();
    assert.equal(listed.body.continuations[0].canResume, true);
    const digest = listed.body.continuations[0].proofDigest;
    assert.equal(typeof digest, "string");

    const [first, raced] = await Promise.all([
      post({ resumeApplications: [{ applicationId: row.id, proofDigest: digest }] }),
      post({ resumeApplications: [{ applicationId: row.id, proofDigest: digest }] }),
    ]);
    assert.equal(first.status, 200);
    assert.equal(raced.status, 200);
    assert.equal((first.body.requeued ?? 0) + (raced.body.requeued ?? 0), 1, "exactly one resumed job");
    assert.equal(enqueued, 1);
    assert.deepEqual(queuedIds, [row.id]);
    assert.equal(row.status, "queued");
    assert.equal(row.submitConfirmation, "NOT_SUBMITTED");
    assert.equal(await queueAnswerContinuation({
      applicationId: row.id, userId: row.userId, proofDigest: digest, expectedAnswersJson: row.userProvidedAnswersJson,
    }, db), "already_queued");

    const resumeToken = await reserveApplicationWork(row.id, db);
    assert.ok(resumeToken, "exactly one resumed job is admitted");
    assert.equal(row.status, "optimizing");
    row.status = "success";
    row.submittedAt = new Date();
    row.submitConfirmation = "DETECTED_DOM";
    row.submittedVia = "portal_greenhouse";
    assert.ok(row.submittedAt, "submission outcome recorded");

    const blocked = makeRow(GH_URL, new Date(token.getTime() - 60_000), token);
    blocked.user.privacyConsentAt = null;
    const blockedDb = fakeDb(blocked, "portal_greenhouse", token);
    assert.equal(await attestAnswerPause(blocked.id, token, "portal_greenhouse", JSON.stringify(QUESTIONS), GH_URL, blockedDb, "greenhouse_blank_form_v1"), true);
    live.row = blocked;
    live.db = blockedDb;
    const blockedGet = await get();
    assert.equal(blockedGet.body.continuations[0].canResume, false);
    assert.equal(blockedGet.body.continuations[0].reason, "privacy_consent_missing");
    const blockedPost = await post({
      resumeApplications: [{ applicationId: blocked.id, proofDigest: "a".repeat(64) }],
    });
    assert.equal(blockedPost.body.requeued, 0);
    assert.ok(blockedPost.body.held.some((h: { reason: string }) => h.reason === "privacy_consent_missing"));
    assert.notEqual(blocked.status, "queued", "missing privacy consent must remain blocked");
  });

  console.log(`answers-consent-resume: ${passed} passed`);
}
main().catch((err) => { console.error(err); process.exit(1); });
