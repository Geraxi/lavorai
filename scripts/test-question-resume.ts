import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { suggestAnswerFromCv } from "../src/lib/cv-question-suggestions";
import * as scoped from "../src/lib/application-question-answers";

// Actual route + actual scope/CV helpers; network, production storage and workers
// are unreachable. Mock persistence enforces every compare-and-set predicate.
const question = { label: "Do you need visa sponsorship?", kind: "radio", options: ["Yes", "No"] };
const fingerprint = scoped.questionFingerprint(question);
const moment = new Date("2026-10-13T12:00:00Z");
const makeApp = (id = "owned", overrides: Record<string, any> = {}) => ({
  id, userId: "owner", status: "needs_answers", pendingQuestionsJson: JSON.stringify([question]), userProvidedAnswersJson: null,
  submitConfirmation: "NOT_SUBMITTED", consentGrantedAt: null, startedAt: moment, submittedAt: null, submittedVia: null,
  user: { preferences: { autoApplyMode: "auto" } }, job: { company: `Employer ${id}`, title: "Designer", location: "Milan", description: "Role description", url: `https://jobs.example.test/${id}` }, ...overrides,
});
const makeAnswer = (source = "user", overrides: Record<string, any> = {}) => ({
  id: "answer-1", userId: "owner", labelKey: scoped.normalizeQuestionLabel(question.label), label: question.label,
  kind: question.kind, optionsJson: JSON.stringify(question.options), source, answer: "Yes", ...overrides,
});
const explicit = (applicationId: string, q = question, answer = "Yes") => scoped.encodeExplicitApplicationAnswers(applicationId,
  [{ ...q, fingerprint: scoped.questionFingerprint(q), answer, source: "user", answeredAt: moment.toISOString() }]);
function setup(options: {
  apps?: any[]; answers?: any[]; mode?: string | null; authenticated?: boolean; profile?: any;
  beforeSave?: (harness: any) => void; beforeQueue?: (harness: any) => void; queueThrows?: boolean;
} = {}) {
  const apps: any[] = structuredClone(options.apps ?? [makeApp()]);
  if (options.mode !== undefined) apps.forEach(app => { app.user.preferences = options.mode === null ? null : { autoApplyMode: options.mode }; });
  const answers: any[] = structuredClone(options.answers ?? []);
  const events: string[] = [], saves: any[] = [], updates: any[] = [], queued: any[] = [], reads: any[] = [];
  let reuseCalls = 0, profile = options.profile ?? null;
  const harness = { apps, answers, events, saves, updates, queued, reads, get reuseCalls() { return reuseCalls; }, get profile() { return profile; }, set profile(value) { profile = value; } };
  const equal = (a: unknown, b: unknown) => a instanceof Date && b instanceof Date ? +a === +b : a === b;
  const prisma = {
    application: {
      findMany: async (query: any) => {
        reads.push(query); assert.equal(query.where.userId, "owner"); assert.equal(query.where.status, "needs_answers");
        return structuredClone(apps.filter(app => app.userId === query.where.userId && app.status === query.where.status));
      },
      updateMany: async (query: any) => {
        const save = "userProvidedAnswersJson" in query.data;
        (save ? saves : updates).push(query);
        (save ? options.beforeSave : options.beforeQueue)?.(harness);
        const { where, data } = query;
        const app = apps.find(row => row.id === where.id);
        if (!app) return { count: 0 };
        for (const field of ["id", "userId", "status", "submitConfirmation", "submittedAt", "submittedVia", "startedAt", "pendingQuestionsJson", "userProvidedAnswersJson", ...(!save ? ["consentGrantedAt"] : [])]) {
          assert.ok(field in where, `Missing optimistic ${save ? "save" : "queue"} gate: ${field}`);
          if (!equal(app[field], where[field])) return { count: 0 };
        }
        assert.ok(!("consentGrantedAt" in data), "Answering questions must not grant application consent");
        assert.ok(!("submittedAt" in data) && !("submittedVia" in data) && !("submitConfirmation" in data), "Answers never manufacture delivery");
        if (save) {
          const persisted = scoped.parseScopedApplicationAnswers(data.userProvidedAnswersJson, app.id);
          assert.ok(persisted.length > 0); assert.ok(persisted.every(answer => answer.source === "user"));
          events.push(`persist:${app.id}`);
        } else {
          const user = where.user.is;
          if (app.user.preferences?.autoApplyMode !== user.preferences.is.autoApplyMode) return { count: 0 };
          if (user.cvProfile && (!profile || profile.id !== user.cvProfile.is.id || !equal(profile.updatedAt, user.cvProfile.is.updatedAt))) return { count: 0 };
          assert.equal(data.status, "queued"); events.push(`transition:${app.id}`);
        }
        Object.assign(app, data);
        return { count: 1 };
      },
    },
    userAnswer: { findMany: async (query: any) => {
      assert.equal(query.where.userId, "owner");
      return structuredClone(answers.filter(answer => answer.userId === "owner" && (!query.where.source || answer.source === query.where.source)));
    }, upsert() { throw new Error("Scoped answers must never become global UserAnswer permissions"); } },
    cVProfile: { findUnique: async (query: any) => { assert.equal(query.where.userId, "owner"); return structuredClone(profile); } },
  };
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, options?: { status: number }) => ({ status: options?.status ?? 200, body }) } },
    "@/lib/db": { prisma },
    "@/lib/session": { getCurrentUser: async () => options.authenticated === false ? null : { id: "owner", yearsExperience: 7, locale: "en" } },
    "@/lib/application-queue": { enqueueApplication: async (id: string, queueOptions: any) => {
      assert.equal(queueOptions?.preserveClaim, true); assert.equal(apps.find(app => app.id === id)?.status, "queued");
      queued.push({ id, options: queueOptions }); events.push(`enqueue:${id}`);
      if (options.queueThrows) throw new Error("synthetic_queue_unavailable");
    } },
    "@/lib/application-question-answers": scoped,
    "@/lib/cv-answer-reuse": { reuseCvAnswers: async (userId: string) => { assert.equal(userId, "owner"); reuseCalls++; return 0; } },
    "@/lib/cv-profile-types": { rowToProfile: (row: any) => row },
    "@/lib/cv-question-suggestions": { suggestAnswerFromCv },
  };
  const module = { exports: {} as Record<string, any> };
  const code = ts.transpileModule(readFileSync("src/app/api/questions/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Date, Map, Set, console: { log() {}, warn() {}, error() {} },
    require(id: string) { assert.ok(id in dependencies, `Unexpected dependency ${id}`); return dependencies[id]; }, fetch() { throw new Error("Network forbidden"); },
  }, { filename: "src/app/api/questions/route.ts" });
  return { ...harness, get: async () => module.exports.GET(),
    post: async (body: any = { answers: [{ applicationId: "owned", fingerprint, answer: "Yes" }] }) => module.exports.POST({ json: async () => body }), harness };
}

async function main() {
  const first = setup({ answers: [makeAnswer("ai")], apps: [makeApp(), makeApp("foreign", { userId: "other-user" })] });
  const saved = await first.post();
  assert.equal(saved.status, 200); assert.equal(saved.body.saved, 1); assert.equal(saved.body.requeued, 1);
  assert.equal(first.answers[0].source, "ai", "No global permission is created or overwritten");
  assert.deepEqual(first.events, ["persist:owned", "transition:owned", "enqueue:owned"]);
  assert.equal(first.apps[1].status, "needs_answers");
  assert.equal(scoped.parseScopedApplicationAnswers(first.apps[0].userProvidedAnswersJson, "owned")[0].source, "user");
  assert.deepEqual(scoped.parseScopedApplicationAnswers(first.apps[0].userProvidedAnswersJson, "foreign"), []);

  for (const [mode, consent, expected] of [["auto", null, 1], ["manual", moment, 1], ["hybrid", moment, 1], ["manual", null, 0], ["hybrid", null, 0], ["off", moment, 0], ["unknown", moment, 0], [null, moment, 0]] as const) {
    const test = setup({ mode, apps: [makeApp("owned", { consentGrantedAt: consent })] });
    assert.equal((await test.post()).body.requeued, expected, `Wrong mode/consent gate ${mode}`); assert.equal(test.queued.length, expected);
  }
  for (const marker of [null, "UNCONFIRMED", "SUBMISSION_STARTED", "DETECTED_HTTP_200", "EMAIL_SENT"]) {
    const test = setup({ apps: [makeApp("owned", { submitConfirmation: marker })] });
    assert.equal((await test.post()).body.requeued, 0); assert.equal(test.updates.length, 0);
  }
  for (const source of ["user", "ai", "rule", "assumed", "cv", "pending"]) {
    const test = setup({ answers: [makeAnswer(source)] });
    assert.equal((await test.post({ answers: [] })).body.requeued, 0, `Global ${source} declaration is not application authority`);
  }
  for (const status of ["queued", "applying", "success", "failed", "awaiting_consent"]) {
    const test = setup({ apps: [makeApp("owned", { status })] });
    assert.equal((await test.post({ answers: [] })).body.requeued, 0); assert.equal(test.updates.length, 0);
  }
  const stored = setup({ apps: [makeApp("owned", { userProvidedAnswersJson: explicit("owned") })] });
  assert.equal((await stored.post({ answers: [] })).body.requeued, 1);
  console.log("[question-resume] Scoped source=user persistence precedes queue; owner, mode, consent, outcome and legacy authority gates passed.");

  const second = { label: "When can you start?", kind: "text", options: [] };
  const missing = setup({ apps: [makeApp("owned", { pendingQuestionsJson: JSON.stringify([question, second]) })] });
  assert.equal((await missing.post()).body.requeued, 0);
  for (const pendingQuestionsJson of ["not-json", "null", "{}", "[]", JSON.stringify([question, { kind: "text" }])]) {
    const test = setup({ apps: [makeApp("owned", { pendingQuestionsJson, userProvidedAnswersJson: explicit("owned") })] });
    assert.equal((await test.post({ answers: [] })).body.requeued, 0);
  }
  const invalid = setup({ apps: [makeApp("owned", { pendingQuestionsJson: JSON.stringify([second, question]) })] });
  assert.equal((await invalid.post({ answers: [{ applicationId: "owned", fingerprint: scoped.questionFingerprint(second), answer: "Monday" }, { applicationId: "owned", fingerprint, answer: "Maybe" }] })).status, 400);
  assert.equal(invalid.saves.length, 0); assert.equal(invalid.harness.reuseCalls, 0); assert.equal(invalid.updates.length, 0);
  const legacyPayload = setup();
  assert.equal((await legacyPayload.post({ answers: [{ labelKey: "i agree", answer: "Yes" }] })).status, 400);
  const foreign = setup({ apps: [makeApp(), makeApp("foreign", { userId: "other-user" })] });
  assert.equal((await foreign.post({ answers: [{ applicationId: "foreign", fingerprint, answer: "Yes" }] })).status, 404);
  assert.equal(foreign.saves.length, 0);
  const changedFingerprint = setup();
  assert.equal((await changedFingerprint.post({ answers: [{ applicationId: "owned", fingerprint: "a".repeat(64), answer: "Yes" }] })).status, 409);
  assert.equal(changedFingerprint.saves.length, 0);
  console.log("[question-resume] Invalid batches, foreign targets, stale fingerprints and incomplete requirements cannot release applications.");

  const declaration = { label: "I agree", kind: "checkbox", options: [] };
  const consentApps = [makeApp("alpha", { pendingQuestionsJson: JSON.stringify([declaration]) }), makeApp("beta", { pendingQuestionsJson: JSON.stringify([declaration]) })];
  const generic = setup({ apps: consentApps, answers: [makeAnswer("user", { label: "I agree", kind: "checkbox", answer: "Yes" })] });
  const cards = (await generic.get()).body.questions;
  assert.equal(cards.length, 2); assert.notEqual(cards[0].id, cards[1].id);
  assert.equal(cards[0].answer, ""); assert.equal(cards[1].answer, ""); assert.equal(cards[0].suggestion, null);
  assert.ok(cards.every((card: any) => card.applications.length === 1 && card.requiresApplicationScope));
  const fp = scoped.questionFingerprint(declaration);
  assert.equal((await generic.post({ answers: [{ applicationId: "alpha", fingerprint: fp, answer: "Yes" }] })).body.requeued, 1);
  assert.deepEqual(generic.queued.map(row => row.id), ["alpha"]);
  assert.equal(generic.apps[1].userProvidedAnswersJson, null);
  const wrongEnvelope = setup({ apps: [makeApp("beta", { pendingQuestionsJson: JSON.stringify([declaration]), userProvidedAnswersJson: explicit("alpha", declaration) })] });
  assert.equal((await wrongEnvelope.post({ answers: [] })).body.requeued, 0);
  const optionsVariant = { ...question, options: ["Authorized", "Sponsorship needed"] };
  for (const reverse of [false, true]) {
    const apps = [makeApp("alpha"), makeApp("beta", { pendingQuestionsJson: JSON.stringify([optionsVariant]) })];
    const test = setup({ apps: reverse ? apps.reverse() : apps });
    const rows = (await test.get()).body.questions;
    assert.equal(rows.length, 2); assert.notEqual(rows[0].fingerprint, rows[1].fingerprint);
    assert.equal((await test.post({ answers: [{ applicationId: "beta", fingerprint: scoped.questionFingerprint(optionsVariant), answer: "Sponsorship needed" }] })).body.requeued, 1);
    assert.deepEqual(test.queued.map(row => row.id), ["beta"]);
  }
  const declined = setup({ apps: [makeApp("owned", { pendingQuestionsJson: JSON.stringify([declaration]) })] });
  assert.equal((await declined.post({ answers: [{ applicationId: "owned", fingerprint: fp, answer: "No" }] })).body.requeued, 0);
  assert.equal(scoped.parseScopedApplicationAnswers(declined.apps[0].userProvidedAnswersJson, "owned")[0].answer, "No");
  console.log("[question-resume] Employer-scoped legal declarations, refusal preservation and independent option-variant cards passed.");

  const races: Array<[string, (h: any) => void]> = [
    ["status", h => { h.apps[0].status = "applying"; }], ["mode", h => { h.apps[0].user.preferences.autoApplyMode = "off"; }],
    ["consent", h => { h.apps[0].consentGrantedAt = null; }], ["questions", h => { h.apps[0].pendingQuestionsJson = JSON.stringify([question, second]); }],
    ["attempt", h => { h.apps[0].startedAt = new Date(+moment + 1000); }], ["owner", h => { h.apps[0].userId = "other-user"; }],
    ["outcome", h => { h.apps[0].submitConfirmation = "UNCONFIRMED"; }], ["scoped-answer", h => { h.apps[0].userProvidedAnswersJson = explicit("owned", question, "No"); }],
    ["delivery", h => { h.apps[0].submittedVia = "email_recruiter"; }],
  ];
  for (const [name, beforeQueue] of races) {
    const test = setup({ apps: [makeApp("owned", { consentGrantedAt: moment, user: { preferences: { autoApplyMode: "manual" } } })], beforeQueue });
    assert.equal((await test.post()).body.requeued, 0, `${name} queue race must fail CAS`); assert.equal(test.queued.length, 0);
    assert.notEqual(test.apps[0].pendingQuestionsJson, null);
  }
  const saveRace = setup({ beforeSave: h => { h.apps[0].userProvidedAnswersJson = explicit("owned", question, "No"); } });
  assert.equal((await saveRace.post()).status, 409);
  assert.equal(scoped.parseScopedApplicationAnswers(saveRace.apps[0].userProvidedAnswersJson, "owned")[0].answer, "No", "Concurrent save must not be lost");
  assert.equal(saveRace.queued.length, 0);
  console.log("[question-resume] Application, consent, question, mode, attempt and scoped-answer races are rejected without lost updates.");

  const cv = { id: "cv-owner", updatedAt: moment, firstName: "Alex", lastName: "Example", email: "alex@example.test", phone: "", city: "Milano", title: "Designer", summary: "", experiences: [], skills: [], languages: [], education: [], links: [] };
  const city = { label: "City", kind: "select", options: ["Milano", "Roma"] };
  const cvApp = makeApp("owned", { pendingQuestionsJson: JSON.stringify([city]) });
  const exactCv = setup({ apps: [cvApp], profile: cv });
  assert.equal((await exactCv.post({ answers: [] })).body.requeued, 1); assert.equal(exactCv.saves.length, 0);
  const cvRace = setup({ apps: [cvApp], profile: cv, beforeQueue: h => { h.profile.updatedAt = new Date(+moment + 1000); } });
  assert.equal((await cvRace.post({ answers: [] })).body.requeued, 0);
  const legal = setup({ profile: cv }); assert.equal((await legal.post({ answers: [] })).body.requeued, 0);
  const safeSuggestion = setup({ apps: [cvApp], answers: [makeAnswer("user", { label: "City", kind: "select", answer: "Milano" })] });
  const suggestion = (await safeSuggestion.get()).body.questions[0];
  assert.equal(suggestion.suggestion, "Milano"); assert.equal(suggestion.answer, ""); assert.equal(suggestion.suggestionSource, "previous_user");
  assert.equal((await safeSuggestion.post({ answers: [] })).body.requeued, 0, "Historical factual values are suggestions, not scoped authority");
  const reuse = setup({ profile: cv }); assert.equal((await reuse.post({ reuseCvOnly: true })).status, 200); assert.equal(reuse.updates.length, 0);
  const queueFailure = setup({ queueThrows: true }); assert.equal((await queueFailure.post()).body.requeued, 1); assert.equal(queueFailure.apps[0].status, "queued");
  const auth = setup({ authenticated: false }); assert.equal((await auth.post()).status, 401); assert.equal(auth.reads.length, 0);
  console.log("[question-resume] Exact fresh CV, non-authoritative historical facts, no inferred legal answers, durable publication and auth checks passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
