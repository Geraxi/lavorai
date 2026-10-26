import * as customerRollout from "../src/lib/customer-rollout";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import * as scoped from "../src/lib/application-question-answers";
import * as facts from "../src/lib/candidate-facts";
import * as continuation from "../src/lib/application-answer-continuation";
import * as guidance from "../src/lib/application-continuation-guidance";
import * as profile from "../src/lib/cv-profile-types";
import * as answers from "../src/lib/application-answers";

const question = { label: "Do you need visa sponsorship in the UK?", kind: "radio", options: ["Yes", "No"] };
const greenhouseTest = process.argv.includes("--greenhouse");
const provider = greenhouseTest ? "greenhouse" : "recruitee";
const channel = `portal_${provider}`;
const urlFor = (id: string) => greenhouseTest ? `https://boards.greenhouse.io/fixture/jobs/${id.replace(/\D/g, "")}` : `https://fixture.recruitee.com/o/${id}`;
async function main() {
  // This suite owns a new, ephemeral localhost server. No ambient DB URLs,
  // .env files, credentials, browser sessions or actual employer requests.
  const dir = await mkdtemp(join(tmpdir(), "lavorai-continuation-"));
  const port = greenhouseTest ? 55457 : 55456;
  process.env.DATABASE_URL = `postgresql://postgres:password@127.0.0.1:${port}/postgres?connection_limit=24`;
  process.env.DIRECT_URL = process.env.DATABASE_URL;
  process.env.APPLICATIONS_PAUSED = "false"; process.env.QUEUE_MODE = "db";
  process.env.APPLICATION_SENDING_MODE = "manual_only";
  process.env.APPLICATION_ROLLOUT_START_AT = "2026-10-14T11:47:00.000Z";
  process.env.APPLY_GLOBAL_DAILY_CAP = "10";
  const { default: EmbeddedPostgres } = await import(process.env.WORKER_TEST_EMBEDDED_POSTGRES ?? "embedded-postgres");
  const pg = new EmbeddedPostgres({ databaseDir: join(dir, "data"), port, persistent: false, postgresFlags: ["-h", "127.0.0.1", "-c", "unix_socket_directories="], onLog: () => {}, onError: () => {} });
  let db: import("@prisma/client").PrismaClient | undefined;
  try {
    await pg.initialise(); await pg.start();
    const { prisma } = await import("../src/lib/db"); db = prisma;
    const gates = await import("../src/lib/application-worker-gates");
    const claim = await import("../src/lib/application-claim");
    const budget = await import("../src/lib/application-submission-budget");
    const pause = await import("../src/lib/application-pause");
    const schemaText = await readFile("prisma/schema.prisma", "utf8");
    const baseline = join(dir, "baseline.prisma");
    await writeFile(baseline, schemaText.replace(/  \/\/\/ Server evidence[^\n]*\n  answerContinuationJson[^\n]*\n/, ""));
    const sql = execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "diff", "--from-empty", "--to-schema-datamodel", baseline, "--script"], { encoding: "utf8", env: process.env });
    for (const statement of sql.split(/;\s*(?:\n|$)/).filter(s => s.trim())) await db.$executeRawUnsafe(statement);
    await db.user.create({ data: { id: "existing", email: "existing@example.invalid" } });
    const existing = await db.user.findUniqueOrThrow({ where: { id: "existing" } });
    const legacyJob = await db.job.create({ data: { externalId: "legacy", source: "synthetic", title: "Existing", description: "Synthetic", url: "https://fixture.recruitee.com/o/legacy" } });
    await db.$executeRaw`INSERT INTO "Application" (id, "userId", "jobId", portal, status, "createdAt") VALUES ('existing-app', 'existing', ${legacyJob.id}, 'recruitee', 'needs_answers', NOW())`;
    const existingApp = await db.$queryRaw`SELECT row_to_json(a) AS value FROM "Application" a WHERE id = 'existing-app'`;
    await db.$executeRawUnsafe(await readFile("prisma/migrations/20261014210000_answer_continuation/migration.sql", "utf8"));
    assert.deepEqual(await db.user.findUniqueOrThrow({ where: { id: "existing" } }), existing);
    const migratedApp = await db.$queryRaw<Array<{ value: Record<string, unknown> }>>`SELECT row_to_json(a) AS value FROM "Application" a WHERE id = 'existing-app'`;
    assert.equal(migratedApp[0].value.answerContinuationJson, null);
    delete migratedApp[0].value.answerContinuationJson;
    assert.deepEqual(migratedApp, existingApp, "Exact migration preserves populated application and backfills no proof");

    let signedIn: string | null = null, publicationFailure = false;
    const load = async (path: string, dependencies: Record<string, any>, append = "") => {
      const module = { exports: {} as any };
      const code = ts.transpileModule(await readFile(path, "utf8") + append, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
      vm.runInNewContext(code, { module, exports: module.exports, Date, Map, Set, URL, Buffer, process: { env: process.env }, console: { log() {}, warn() {}, error() {} },
        require: (name: string) => { if (name === "@/lib/customer-rollout") return customerRollout; if (!(name in dependencies)) throw new Error(`Unstubbed dependency ${name}`); return dependencies[name]; },
        fetch: () => { throw new Error("External network forbidden"); } });
      return module.exports;
    };
    const queue = await load("src/lib/application-queue.ts", {
      "./application-answer-continuation": continuation,
      "@/lib/application-rollout": await import("../src/lib/application-rollout"),
      "@/lib/application-pause": pause, "@/lib/db": { prisma: db },
      "@/lib/application-worker": { processApplication: () => { throw new Error("Queue must publish durably, not execute"); } },
    });
    const route = await load("src/app/api/questions/route.ts", {
      "@/lib/application-answer-continuation": continuation, "@/lib/application-worker-gates": gates,
      "@/lib/application-continuation-guidance": guidance,
      "@/lib/candidate-facts": facts, "@/lib/application-answers": answers,
      "@/lib/db": { prisma: db }, "@/lib/session": { getCurrentUser: async () => signedIn ? db!.user.findUnique({ where: { id: signedIn } }) : null },
      "next/server": { NextResponse: { json: (body: any, options?: any) => ({ body, status: options?.status ?? 200 }) } },
      "@/lib/cv-profile-types": profile, "@/lib/application-question-answers": scoped,
      "@/lib/cv-answer-reuse": { reuseCvAnswers: () => { throw new Error("Unexpected global write"); } },
      "@/lib/reusable-standard-answers": { persistReusableStandardAnswers: async () => 0 },
      "@/lib/auto-apply-preferences": { prefersRemoteOrHybrid: () => false },
      "@/lib/application-queue": { enqueueApplication: async (...args: [string, { preserveClaim?: boolean }?]) => {
        if (publicationFailure) throw new Error("Synthetic publication outage"); return queue.enqueueApplication(...args);
      } },
    });
    const workerText = await readFile("src/lib/application-worker.ts", "utf8");
    const workerDependencies: Record<string, any> = Object.fromEntries([...workerText.matchAll(/from "([^"]+)"/g)].map(match => [match[1], {}]));
    Object.assign(workerDependencies, {
      "@/lib/db": { prisma: db }, "@/lib/application-pause": pause, "@/lib/application-worker-gates": gates,
      "@/lib/application-question-answers": scoped, "@/lib/cv-profile-types": profile,
      "@/lib/email": { inboundReplyAddress: () => "reply+synthetic@example.invalid" },
      "@/lib/ai-usage": { withAiUsageContext: (_context: unknown, run: () => unknown) => run(), recordAiUsage: () => {} },
      "@/lib/job-liveness": { checkJobUrlLiveness: async () => ({ state: "live" }), JOB_LIVENESS_UNKNOWN_HELD_MESSAGE: "Disponibilità dell'annuncio non verificabile: invio sospeso, nuovo controllo più tardi.", JOB_CLOSED_HELD_MESSAGE: "Annuncio chiuso dall'azienda. Nessun invio effettuato." },
      "@/lib/browser": { launchBrowser: async () => ({ close: async () => {} }), humanContext: async () => ({ newPage: async () => ({}) }) },
      "@/lib/scrapers/ats-companies": Object.fromEntries(["GREENHOUSE", "LEVER", "ASHBY", "WORKABLE", "SMARTRECRUITERS"].map(name => [`${name}_COMPANIES`, []])),
    });
    const worker = await load("src/lib/application-worker.ts", workerDependencies,
      "\nexports.fixtureAttempt = attemptPortalAdapterSubmit; exports.fixtureAudit = persistAiAnswers;\n");
    let sequence = 0, candidatePosts = 0;
    const make = async (patch: Record<string, any> = {}) => {
      const id = `fixture-${++sequence}`; const now = new Date();
      const user = await db!.user.create({ data: { id: `${id}-user`, email: `${id}@example.invalid`, tier: "pro", emailVerified: now, privacyConsentAt: now,
        subscriptionStatus: "active", currentPeriodEnd: new Date(+now + 86400000),
        preferences: { create: { autoApplyMode: "manual" } }, cvProfile: { create: profile.profileToRow({ ...profile.EMPTY_PROFILE, firstName: "Alex", lastName: "Example", city: "Milano" }) } } });
      const job = await db!.job.create({ data: { externalId: id, source: "synthetic", title: "Synthetic", description: "Synthetic", url: urlFor(id), company: "Fixture" } });
      const app = await db!.application.create({ data: { id, userId: user.id, jobId: job.id, portal: provider, createdAt: now, consentGrantedAt: now, ...patch } });
      return app;
    };
    const attempt = async (app: any, token: Date, adapter: any) => worker.fixtureAttempt({ applicationId: app.id, workToken: token,
      adapter, jobUrl: (await db!.job.findUniqueOrThrow({ where: { id: app.jobId } })).url,
      userId: app.userId, userEmail: `${app.id}@example.invalid`, cvPath: "/tmp/synthetic-cv.docx", clPath: "/tmp/synthetic-letter.docx", coverLetterText: "Synthetic" });
    const pauseAdapter = { id: provider, label: provider, apply: async (_page: any, input: any) => {
      if (greenhouseTest) {
        assert.equal(await gates.attestAnswerPause(input.applicationId, (await db!.application.findUniqueOrThrow({where:{id:input.applicationId}})).startedAt!, channel, JSON.stringify([question]), input.jobUrl), false, "No Greenhouse proof from generic adapter outcome");
        assert.equal(await input.onPreTransmissionPause([question]), true);
        assert.equal(await input.beforeCandidateData(), false, "Paused wrapper cannot transmit");
      }
      return { ok: false, status: "needs_user_input", pendingQuestions: [question], error: "Synthetic missing answer" };
    } };
    const paused = async () => {
      const app = await make(); const token = await gates.reserveApplicationWork(app.id); assert.ok(token);
      await attempt(app, token, pauseAdapter);
      const row = await db!.application.findUniqueOrThrow({ where: { id: app.id } });
      assert.equal(row.status, "needs_answers"); assert.ok(row.answerContinuationJson);
      return { app, token, proof: row.answerContinuationJson!, digest: continuation.continuationDigest(row.answerContinuationJson!) };
    };
    const post = (body: any) => route.POST({ json: async () => body });
    const save = async (f: Awaited<ReturnType<typeof paused>>, value = "No") => {
      signedIn = f.app.userId;
      const result = await post({ answers: [{ applicationId: f.app.id, fingerprint: scoped.questionFingerprint(question), answer: value }] });
      const card = (await route.GET()).body.continuations.find((item: any) => item.applicationId === f.app.id);
      if (card?.proofDigest) f.digest = card.proofDigest;
      return result;
    };
    const resume = async (f: Awaited<ReturnType<typeof paused>>) => {
      signedIn = f.app.userId;
      return post({ resumeApplications: [{ applicationId: f.app.id, proofDigest: f.digest }] });
    };
    const ledger = () => db!.applicationSubmissionReservation.count();
    const fixture = await paused();
    assert.equal(await ledger(), 1);
    assert.equal((await save(fixture)).body.requeued, 0, "Saving alone never resumes");
    assert.equal((await db.application.findUniqueOrThrow({ where: { id: fixture.app.id } })).status, "needs_answers");
    const reviewedDigest = fixture.digest;
    await save(fixture, "Yes");
    signedIn = fixture.app.userId;
    assert.equal((await post({ resumeApplications: [{ applicationId: fixture.app.id, proofDigest: reviewedDigest }] })).body.requeued, 0, "Answer changes after review invalidate confirmation");
    await save(fixture, "No");
    const reviewedFacts = fixture.digest;
    await db.cVProfile.update({ where: { userId: fixture.app.userId }, data: { city: "Roma" } });
    assert.equal((await resume(fixture)).body.requeued, 0, "Changed factual sources invalidate confirmation");
    await db.cVProfile.update({ where: { userId: fixture.app.userId }, data: { city: "Milano" } });
    assert.equal(fixture.digest, reviewedFacts);
    const responses = await Promise.all([resume(fixture), resume(fixture)]);
    assert.equal(responses.reduce((sum, response) => sum + response.body.requeued, 0), 1);
    assert.ok((await claim.findClaimableQueued(100)).includes(fixture.app.id));
    assert.equal((await Promise.all([claim.claimApplication(fixture.app.id), claim.claimApplication(fixture.app.id)])).filter(Boolean).length, 1);
    const resumedToken = await gates.reserveApplicationWork(fixture.app.id); assert.ok(resumedToken && +resumedToken > +fixture.token);
    assert.equal(await gates.reserveApplicationWork(fixture.app.id), null);
    const ready = await db.application.findUniqueOrThrow({ where: { id: fixture.app.id } });
    assert.equal(continuation.parseAnswerContinuation(ready.answerContinuationJson)!.attemptStartedAt, fixture.token.toISOString());
    assert.equal(await gates.beginApplicationSubmission(fixture.app.id, fixture.token, undefined, channel), false, "Old token cannot transmit");
    await worker.fixtureAudit(fixture.app.userId, fixture.app.id, fixture.token, [{ label: "Old", kind: "text", answer: "late", source: "ai" }]);
    assert.equal((await db.application.findUniqueOrThrow({ where: { id: fixture.app.id } })).answersUsedJson, null);
    await attempt(fixture.app, resumedToken, { id: provider, label: provider, apply: async (_page: any, input: any) => {
      if (greenhouseTest) {
        assert.equal(await input.beforeSubmit(), false, "Cannot submit before data boundary");
        assert.equal(await input.beforeCandidateData(), true);
        assert.equal(await input.beforeCandidateData(), false, "One upload/data authorization");
        assert.equal(await input.onPreTransmissionPause([question]), false, "Post-upload questions cannot mint proof");
      }
      const final = await Promise.all([input.beforeSubmit(), input.beforeSubmit()]);
      candidatePosts += final.filter(Boolean).length;
      if (greenhouseTest) {
        const verification = await Promise.all([input.beforeVerificationSubmit(), input.beforeVerificationSubmit()]);
        assert.equal(verification.filter(Boolean).length, 1, "One code submission within the same attempt");
      }
      return { ok: false, status: "submission_unconfirmed", error: "Synthetic uncertain POST" };
    } });
    assert.equal(candidatePosts, 1); assert.equal(await ledger(), 1, "Same day uses the original slot");
    assert.equal(await gates.attestAnswerPause(fixture.app.id, resumedToken, channel, JSON.stringify([question]), urlFor(fixture.app.id)), false, "Final boundary invalidates continuation");
    assert.equal(await gates.recheckApplicationSubmission(fixture.app.id, resumedToken, undefined, channel), false, "One final authorization only");
    console.log("PASS actual route → queue → claim → worker adapter boundary: candidate confirmation, concurrent idempotency, original reservation, stale work/audit fencing, one final send authorization.");

    const blocked = await paused(); await save(blocked);
    const original = await db.application.findUniqueOrThrow({ where: { id: blocked.app.id } });
    const assertHeld = async (patch: any) => {
      await db!.application.update({ where: { id: blocked.app.id }, data: patch });
      assert.equal((await resume(blocked)).body.requeued, 0, JSON.stringify(patch));
      const restore = Object.fromEntries(Object.keys(patch).map(key => [key, (original as any)[key]]));
      await db!.application.update({ where: { id: blocked.app.id }, data: restore });
    };
    for (const patch of [{ answerContinuationJson: null }, { createdAt: new Date("2026-10-14T11:46:59Z") }, { consentGrantedAt: null },
      { retryCount: 1 }, { submitConfirmation: "UNCONFIRMED" }, { submittedAt: new Date() }, { submittedVia: "email_recruiter" },
      { submissionReceiptJson: '{}' }, { canaryLog: '{"submitHttpStatus":200}' }, { startedAt: new Date(0) }, { completedAt: new Date() }, { pendingQuestionsJson: '[]' }, { viewedAt: new Date() }]) await assertHeld(patch);
    for (const field of ["applicationId", "userId", "jobId", "jobUrl", "attemptStartedAt", "channel", "consentGrantedAt", "pendingHash", "workToken"]) {
      const tampered = { ...JSON.parse(blocked.proof), [field]: field.includes("At") || field === "workToken" ? new Date(0).toISOString() : "wrong" };
      const json = JSON.stringify(tampered); await db.application.update({ where: { id: blocked.app.id }, data: { answerContinuationJson: json } });
      signedIn = blocked.app.userId;
      assert.equal((await post({ resumeApplications: [{ applicationId: blocked.app.id, proofDigest: continuation.continuationDigest(json) }] })).body.requeued, 0, field);
    }
    await db.application.update({ where: { id: blocked.app.id }, data: { answerContinuationJson: blocked.proof } });
    signedIn = "foreign";
    assert.equal((await post({ resumeApplications: [{ applicationId: blocked.app.id, proofDigest: blocked.digest }] })).status, 401);
    const extraUser = await db.user.findUniqueOrThrow({ where: { id: "existing" } }); signedIn = extraUser.id;
    assert.equal((await post({ resumeApplications: [{ applicationId: blocked.app.id, proofDigest: blocked.digest }] })).body.requeued, 0);
    for (const patch of [{ suspendedAt: new Date() }, { privacyConsentAt: null }, { emailVerified: null }, { subscriptionStatus: "paused" }]) {
      const oldUser = await db.user.findUniqueOrThrow({ where: { id: blocked.app.userId } });
      await db.user.update({ where: { id: blocked.app.userId }, data: patch }); assert.equal((await resume(blocked)).body.requeued, 0);
      await db.user.update({ where: { id: blocked.app.userId }, data: Object.fromEntries(Object.keys(patch).map(key => [key, (oldUser as any)[key]])) });
    }
    await db.userPreferences.update({ where: { userId: blocked.app.userId }, data: { autoApplyMode: "off" } }); assert.equal((await resume(blocked)).body.requeued, 0);
    await db.userPreferences.update({ where: { userId: blocked.app.userId }, data: { autoApplyMode: "manual" } });
    await db.job.update({ where: { id: blocked.app.jobId }, data: { closedAt: new Date() } }); assert.equal((await resume(blocked)).body.requeued, 0);
    await db.job.update({ where: { id: blocked.app.jobId }, data: { closedAt: null } });
    const otherJob = await db.job.create({ data: { externalId: "duplicate", source: "other-feed", title: "Same destination", description: "Synthetic", url: greenhouseTest ? `https://job-boards.greenhouse.io/fixture/jobs/${blocked.app.id.replace(/\D/g, "")}?source=other` : `${urlFor(blocked.app.id)}?source=other` } });
    const sibling = await db.application.create({ data: { userId: blocked.app.userId, jobId: otherJob.id, portal: "recruitee" } });
    assert.equal((await resume(blocked)).body.requeued, 0, "Canonical destination duplicate across imported jobs");
    await db.application.delete({ where: { id: sibling.id } });
    const duplicateReservation = await db.applicationSubmissionReservation.create({ data: {
      applicationId: "removed-duplicate", subjectKey: budget.submissionSubjectKey(blocked.app.userId, otherJob.id),
      attemptStartedAt: new Date(), channel, rolloutStartedAt: new Date(process.env.APPLICATION_ROLLOUT_START_AT!),
      budgetDay: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`),
    } });
    assert.equal((await resume(blocked)).body.requeued, 0, "Retained reservation on a duplicate imported job still blocks continuation");
    await db.applicationSubmissionReservation.delete({ where: { id: duplicateReservation.id } }); // restore synthetic fixture only
    const email = await db.applicationEmailAttempt.create({ data: { applicationId: blocked.app.id, attemptKey: "synthetic-attempt", recipient: "fixture@example.invalid", status: "sending" } });
    assert.equal((await resume(blocked)).body.requeued, 0, "Any email attempt blocks reuse");
    await db.applicationEmailAttempt.delete({ where: { id: email.id } }); // synthetic fixture only
    await assertHeld({ userProvidedAnswersJson: null });
    publicationFailure = true; assert.equal((await resume(blocked)).body.requeued, 1); publicationFailure = false;
    assert.ok((await claim.findClaimableQueued(100)).includes(blocked.app.id), "Notification failure retains durable queue");
    console.log("PASS historical/uncertain/changed/foreign cases, consent/account/job gates, incomplete answers, canonical duplicates, email evidence and durable publication failure.");

    const browser = await make(); const browserToken = await gates.reserveApplicationWork(browser.id); assert.ok(browserToken);
    assert.equal(await gates.beginApplicationSubmission(browser.id, browserToken, undefined, "portal_lever"), true);
    assert.equal(await gates.attestAnswerPause(browser.id, browserToken, "portal_lever", JSON.stringify([question]), "https://fixture.example.invalid"), false, "Browser pre-upload paths get no proof");
    const full = await paused(); await save(full);
    const count = await ledger();
    for (let i = count; i < 10; i++) await db.applicationSubmissionReservation.create({ data: { applicationId: `consumed-${i}`, subjectKey: budget.submissionSubjectKey(`other-${i}`, `job-${i}`), attemptStartedAt: new Date(), channel: "email_recruiter", rolloutStartedAt: new Date(process.env.APPLICATION_ROLLOUT_START_AT!), budgetDay: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`) } });
    assert.equal(await ledger(), 10);
    assert.equal((await resume(full)).body.requeued, 1);
    assert.equal(await claim.claimApplication(full.app.id), true);
    const fullToken = await gates.reserveApplicationWork(full.app.id); assert.ok(fullToken);
    assert.equal(await gates.beginApplicationSubmission(full.app.id, fullToken, undefined, channel), true, "Existing same-day reservation is not refunded or doubled at cap");
    if (greenhouseTest) {
      const dataResults = await Promise.all([gates.recheckApplicationSubmission(full.app.id, fullToken, undefined, channel, "candidate_data"), gates.recheckApplicationSubmission(full.app.id, fullToken, undefined, channel, "candidate_data")]);
      assert.equal(dataResults.filter(Boolean).length, 1, "Database serializes candidate-data boundary");
      assert.equal(await gates.attestAnswerPause(full.app.id, fullToken, channel, JSON.stringify([question]), urlFor(full.app.id), undefined, "greenhouse_blank_form_v1"), false, "Durable transmission evidence prevents re-pause");
      const finals = await Promise.all([gates.recheckApplicationSubmission(full.app.id, fullToken, undefined, channel), gates.recheckApplicationSubmission(full.app.id, fullToken, undefined, channel)]);
      assert.equal(finals.filter(Boolean).length, 1, "Database serializes final submit");
      const codes = await Promise.all([gates.recheckApplicationSubmission(full.app.id, fullToken, undefined, channel, "verification_submit"), gates.recheckApplicationSubmission(full.app.id, fullToken, undefined, channel, "verification_submit")]);
      assert.equal(codes.filter(Boolean).length, 1, "Database serializes code submit");
      const capturedAt = new Date();
      const completion = { submittedAt: capturedAt, submittedVia: channel, submitConfirmation: "DETECTED_HTTP_200", completedAt: capturedAt };
      assert.equal(await gates.completeApplicationSubmission(full.app.id, fullToken, completion), false, "A final click/code is not an ATS receipt");
      const posting = full.app.id.replace(/\D/g, "");
      const receipt = JSON.stringify({ version: 1, provider: "greenhouse", kind: "http", capturedAt: capturedAt.toISOString(), jobId: posting,
        endpoint: `https://boards-api.greenhouse.io/v1/boards/fixture/jobs/${posting}`, operation: "application.create", httpStatus: 200, receiptId: "synthetic-receipt", signal: "application_id" });
      const completions = await Promise.all([gates.completeApplicationSubmission(full.app.id, fullToken, { ...completion, submissionReceiptJson: receipt }), gates.completeApplicationSubmission(full.app.id, fullToken, { ...completion, submissionReceiptJson: receipt })]);
      assert.equal(completions.filter(Boolean).length, 1, "Verified receipt recorded once; concurrent success cannot duplicate delivery accounting");
    }
    const newApp = await make(); const newToken = await gates.reserveApplicationWork(newApp.id); assert.ok(newToken);
    assert.equal(await gates.beginApplicationSubmission(newApp.id, newToken, undefined, channel), false, "Unreserved new transmission blocked at cap");
    assert.equal(await ledger(), 10);
    const prior = await db.applicationSubmissionReservation.findFirstOrThrow({ where: { applicationId: full.app.id } });
    const tomorrow = new Date(+prior.budgetDay + 86400000 + 3600000);
    const originalAttempt = { applicationId: prior.applicationId, subjectKey: prior.subjectKey, attemptStartedAt: prior.attemptStartedAt, channel: prior.channel };
    const at = (attempt: typeof originalAttempt) => db!.$transaction(tx => budget.reserveSubmissionBudget(new Proxy(tx, { get(target, prop) {
      if (prop === "$queryRaw") return (strings: TemplateStringsArray, ...values: any[]) => strings.join("").includes("clock_timestamp") ? Promise.resolve([{ now: tomorrow }]) : target.$queryRaw(strings, ...values);
      return Reflect.get(target, prop);
    } }), attempt, "recheck"));
    assert.equal(await at(originalAttempt), null); assert.equal(await ledger(), 11);
    assert.equal(await at(originalAttempt), null); assert.equal(await ledger(), 11);
    for (let i = 1; i < 10; i++) await db.applicationSubmissionReservation.create({ data: { applicationId: `tomorrow-${i}`, subjectKey: budget.submissionSubjectKey(`tomorrow-${i}`, `job-${i}`), attemptStartedAt: new Date(), channel: "email_recruiter", rolloutStartedAt: new Date(process.env.APPLICATION_ROLLOUT_START_AT!), budgetDay: new Date(+prior.budgetDay + 86400000) } });
    const previous = await db.applicationSubmissionReservation.findFirstOrThrow({ where: { applicationId: blocked.app.id } });
    assert.equal(await at({ applicationId: previous.applicationId, subjectKey: previous.subjectKey, attemptStartedAt: previous.attemptStartedAt, channel: previous.channel }), "rollout_daily_budget_reached");
    assert.equal(await ledger(), 20);
    console.log("PASS global cap ten, no refunds/deletes, same-day identity reuse, locked UTC rollover and exhausted next-day hold. All transmissions were adapter stubs.");
  } finally { if (db) await db.$disconnect(); await pg.stop().catch(() => {}); await rm(dir, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
