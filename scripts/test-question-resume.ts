import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as scoped from "../src/lib/application-question-answers";
import * as facts from "../src/lib/candidate-facts";
import * as continuation from "../src/lib/application-answer-continuation";
import * as guidance from "../src/lib/application-continuation-guidance";
import * as answers from "../src/lib/application-answers";
import { EMPTY_PROFILE } from "../src/lib/cv-profile-types";

const question = { label: "Do you need visa sponsorship?", kind: "radio", options: ["Yes", "No"] };
const fingerprint = scoped.questionFingerprint(question);
const moment = new Date("2026-10-14T12:00:00Z");
const makeApp = (id = "owned", overrides: Record<string, any> = {}) => ({
  id, userId: "owner", jobId: "job", createdAt: moment, retryCount: 0, status: "needs_answers",
  pendingQuestionsJson: JSON.stringify([question]), userProvidedAnswersJson: null,
  submitConfirmation: "NOT_SUBMITTED", consentGrantedAt: moment, startedAt: moment, submittedAt: null, submittedVia: null,
  submissionReceiptJson: null, answerContinuationJson: null, completedAt: null,
  job: { company: `Employer ${id}`, title: "Designer", location: "Milan", description: "Role", url: `https://jobs.example.test/${id}` }, ...overrides,
});
function setup(options: { apps?: any[]; authenticated?: boolean; profile?: any; saved?: any[]; privacy?: boolean; race?: (app: any) => void } = {}) {
  const apps = structuredClone(options.apps ?? [makeApp()]);
  let writes = 0, resumes = 0, queued = 0;
  const equal = (a: any, b: any) => a instanceof Date && b instanceof Date ? +a === +b : a === b;
  const prisma = {
    application: {
      findMany: async ({ where }: any) => structuredClone(apps.filter(app => app.userId === where.userId && app.status === where.status)),
      updateMany: async ({ where, data }: any) => {
        const app = apps.find(app => app.id === where.id); if (!app) return { count: 0 };
        options.race?.(app);
        assert.equal(data.status, undefined, "Saving cannot queue"); assert.equal(data.consentGrantedAt, undefined);
        if (Object.entries(where).some(([key, value]) => !equal(app[key], value))) return { count: 0 };
        Object.assign(app, data); writes++; return { count: 1 };
      },
    },
    userAnswer: { findMany: async () => options.saved ?? [] },
    cVProfile: { findUnique: async () => options.profile ?? null },
    user: { findUnique: async () => ({ email: "alex@example.test", yearsExperience: 7, privacyConsentAt: options.privacy === false ? null : moment }) },
    userPreferences: { findUnique: async () => ({ applicationAnswersJson: '{}' }) },
  };
  const dependencies: Record<string, unknown> = {
    "@/lib/application-answer-continuation": continuation,
    "@/lib/application-continuation-guidance": guidance,
    "@/lib/application-worker-gates": { queueAnswerContinuation: async (input: any) => { resumes++; assert.equal(input.userId, "owner"); return "continuation_proof_missing"; } },
    "@/lib/candidate-facts": facts, "@/lib/application-answers": answers,
    "next/server": { NextResponse: { json: (body: unknown, options?: { status: number }) => ({ status: options?.status ?? 200, body }) } },
    "@/lib/db": { prisma }, "@/lib/session": { getCurrentUser: async () => options.authenticated === false ? null : { id: "owner", yearsExperience: 7, locale: "en" } },
    "@/lib/application-queue": { enqueueApplication: async () => { queued++; } },
    "@/lib/application-question-answers": scoped,
    "@/lib/cv-answer-reuse": { reuseCvAnswers: async () => 0 },
    "@/lib/cv-profile-types": { rowToProfile: (row: any) => row },
  };
  const module = { exports: {} as any };
  const code = ts.transpileModule(readFileSync("src/app/api/questions/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Date, Map, Set, console,
    require: (id: string) => { assert.ok(id in dependencies, id); return dependencies[id]; }, fetch: () => { throw new Error("No network"); } });
  return { apps, get counts() { return { writes, resumes, queued }; }, get: () => module.exports.GET(),
    post: (body: any = { answers: [{ applicationId: "owned", fingerprint, answer: "Yes" }] }) => module.exports.POST({ json: async () => body }) };
}
async function main() {
  const privacy = (await setup({ privacy: false }).get()).body.continuations[0];
  assert.equal(privacy.canResume, false); assert.equal(privacy.reason, "privacy_consent_missing");
  assert.equal(privacy.guidance.href, "/settings#privacy-consent");
  const legacy = (await setup().get()).body.continuations[0];
  assert.equal(legacy.canResume, false); assert.match(legacy.guidance.detail, /Saving answers cannot/);
  assert.equal(legacy.guidance.href, "/applications?id=owned&includeAll=1");
  const test = setup(); const result = await test.post();
  assert.equal(result.status, 200); assert.equal(result.body.saved, 1); assert.equal(result.body.requeued, 0);
  assert.equal(test.apps[0].status, "needs_answers"); assert.equal(test.counts.resumes, 0);
  assert.equal(scoped.parseScopedApplicationAnswers(test.apps[0].userProvidedAnswersJson, "owned")[0].answer, "Yes");
  assert.equal((await test.post({ resumeApplications: [{ applicationId: "owned", proofDigest: "a".repeat(64) }] })).body.held[0].reason, "continuation_proof_missing");
  assert.equal(test.counts.queued, 0);
  for (const status of ["queued", "applying", "success", "failed", "awaiting_consent"]) assert.equal((await setup({ apps: [makeApp("owned", { status })] }).post()).status, 404);
  for (const patch of [{ submitConfirmation: "UNCONFIRMED" }, { submissionReceiptJson: '{}' }, { submittedAt: moment }, { completedAt: moment }, { submittedVia: "email_recruiter" }]) assert.equal((await setup({ apps: [makeApp("owned", patch)] }).post()).status, 409);
  const foreign = setup({ apps: [makeApp("owned", { userId: "other" })] }); assert.equal((await foreign.post()).status, 404); assert.equal(foreign.counts.writes, 0);
  const unauth = setup({ authenticated: false }); assert.equal((await unauth.post()).status, 401); assert.equal((await unauth.get()).status, 401);
  for (const payload of [{ answers: [{ labelKey: "visa", answer: "Yes" }] }, { answers: [{ applicationId: "owned", fingerprint, answer: "Maybe" }] }, { resumeApplications: [{ applicationId: "owned", proofDigest: "bad" }] }]) {
    const invalid = setup(); assert.equal((await invalid.post(payload)).status, 400); assert.equal(invalid.counts.writes, 0);
  }
  assert.equal((await setup().post({ answers: [{ applicationId: "owned", fingerprint: "a".repeat(64), answer: "Yes" }] })).status, 409);
  const conflicting = setup(); assert.equal((await conflicting.post({ answers: [{ applicationId: "owned", fingerprint, answer: "Yes" }, { applicationId: "owned", fingerprint, answer: "No" }] })).status, 400);
  for (const race of [(app: any) => { app.status = "applying"; }, (app: any) => { app.userId = "foreign"; }, (app: any) => { app.consentGrantedAt = null; }, (app: any) => { app.userProvidedAnswersJson = "concurrent"; }, (app: any) => { app.startedAt = new Date(+moment + 1); }, (app: any) => { app.pendingQuestionsJson = "[]"; }, (app: any) => { app.submissionReceiptJson = '{}'; }]) {
    const raced = setup({ race }); assert.equal((await raced.post()).status, 409); assert.equal(raced.counts.writes, 0);
  }
  const declaration = { label: "I agree", kind: "checkbox", options: [] };
  const declined = setup({ apps: [makeApp("owned", { pendingQuestionsJson: JSON.stringify([declaration]) })] });
  assert.equal((await declined.post({ answers: [{ applicationId: "owned", fingerprint: scoped.questionFingerprint(declaration), answer: "No" }] })).status, 200);
  assert.equal(declined.counts.queued, 0);
  const city = { label: "Location (City)", kind: "text", options: [] };
  const cv = setup({ apps: [makeApp("owned", { pendingQuestionsJson: JSON.stringify([city]) })], profile: { ...EMPTY_PROFILE, city: "Milano" } });
  const card = (await cv.get()).body.questions[0]; assert.equal(card.suggestion, "Milano"); assert.equal(card.suggestionSource, "cv"); assert.equal(card.provenance[0].source, "cv");
  const conflictingCity = scoped.encodeExplicitApplicationAnswers("owned", ["Milano", "Roma"].map(answer => ({ ...city, answer, source: "user" as const, answeredAt: moment.toISOString(), fingerprint: scoped.questionFingerprint(city) })));
  const conflictCard = (await setup({ apps: [makeApp("owned", { pendingQuestionsJson: JSON.stringify([city]), userProvidedAnswersJson: conflictingCity })], profile: { ...EMPTY_PROFILE, city: "Milano" } }).get()).body.questions[0];
  assert.equal(conflictCard.suggestion, null); assert.equal(conflictCard.conflict, true);
  const cards = (await setup({ apps: [makeApp("a"), makeApp("b")] }).get()).body.questions;
  assert.equal(cards.length, 2); assert.notEqual(cards[0].id, cards[1].id); assert.equal(cards[0].suggestion, null);
  console.log("PASS questions HTTP: authenticated ownership, scoped assertions/refusals, conflicts, stale form/save races, suggestions with provenance, no implicit resume or legacy permission.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
