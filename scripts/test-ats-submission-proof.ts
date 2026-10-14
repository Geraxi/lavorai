import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import type { Page, Request, Response } from "playwright";
import {
  matchSubmissionRequest, observeSubmission, verifyPageReceipt,
  verifySubmissionResponse, type PageReceiptSnapshot, type SubmissionResponse,
} from "../src/lib/portal-adapters/submission-proof";
import * as securityCode from "../src/lib/application-security-code";
import * as captcha from "../src/lib/portal-adapters/captcha";
import * as proofModule from "../src/lib/portal-adapters/submission-proof";

// Synthetic fixtures only. Every browser, HTTP response and OTP mailbox is
// in-memory. There is no Playwright launch, network, database or employer send.
const job = "https://jobs.ashbyhq.com/acme/job-123";
const ashbyRequest = {
  url: "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApplyToJobPosting&token=DO_NOT_SAVE",
  method: "POST",
  postData: JSON.stringify({ operationName: "ApplyToJobPosting", variables: { input: { jobPostingId: "job-123", email: "private@example.test" } } }),
};
const accepted: SubmissionResponse = {
  ...ashbyRequest, status: 200,
  body: JSON.stringify({ data: { applyToJobPosting: { success: true, applicationId: "receipt-123" } } }),
};
const before: PageReceiptSnapshot = { url: job, receiptText: "Apply for this job", formVisible: true, readable: true };
const after: PageReceiptSnapshot = { ...before, receiptText: "Thank you for applying", formVisible: false };

function testResponses() {
  const receipt = verifySubmissionResponse("ashby", job, accepted).receipt;
  assert.equal(receipt?.receiptId, "receipt-123");
  assert.equal(receipt?.jobId, "job-123");
  assert.equal(receipt?.kind, "http");
  assert.equal(receipt?.operation, "ApplyToJobPosting");
  assert.ok(!JSON.stringify(receipt).includes("private@example.test"));
  assert.ok(!JSON.stringify(receipt).includes("DO_NOT_SAVE"));
  assert.ok(!JSON.stringify(receipt).includes("postData"));

  for (const response of [
    { ...accepted, postData: JSON.stringify({ operationName: "JobBoardAnalytics", variables: { jobPostingId: "job-123" } }) },
    { ...accepted, postData: JSON.stringify({ operationName: "UploadResume", variables: { jobPostingId: "job-123" } }) },
    { ...accepted, postData: JSON.stringify({ operationName: "ApplyToJobPosting", variables: { jobPostingId: "different-job" } }) },
    { ...accepted, postData: JSON.stringify({ operationName: "ApplyToJobPosting", variables: { resume: "job-123" } }) },
    { ...accepted, postData: JSON.stringify({ operationName: "ApplyToJobPosting", variables: { jobPostingId: "job-123" }, query: "query ApplyToJobPosting { applyToJobPosting { success } }" }) },
    { ...accepted, postData: JSON.stringify({ operationName: "ApplyToJobPosting", variables: { jobPostingId: "job-123" }, query: "mutation ApplyToJobPosting { uploadResume { success } }" }) },
    { ...accepted, postData: `[${ashbyRequest.postData}]` },
    { ...accepted, postData: null },
    { ...accepted, method: "GET" },
    { ...accepted, url: "https://jobs.ashbyhq.com.attacker.test/api/non-user-graphql" },
    { ...accepted, url: "https://attacker.test/?redirect=ashbyhq.com/graphql" },
    { ...accepted, url: "https://jobs.ashbyhq.com/api/upload" },
    { ...accepted, status: 302 },
    { ...accepted, status: 204, body: null },
    { ...accepted, body: null },
    { ...accepted, body: "" },
    { ...accepted, body: "<html>OK</html>" },
    { ...accepted, body: "{}" },
    { ...accepted, body: '{"data":{"applyToJobPosting":null}}' },
    { ...accepted, body: '{"data":{"uploadResume":{"success":true}}}' },
    { ...accepted, body: '{"data":{"applyToJobPosting":{"id":"file-upload-id"}}}' },
    { ...accepted, body: '{"data":{"applyToJobPosting":{"status":"pending","success":true}}}' },
    { ...accepted, body: '{"data":{"applyToJobPosting":{"message":"Your application was not submitted"}}}' },
  ]) assert.equal(verifySubmissionResponse("ashby", job, response).receipt, undefined, JSON.stringify(response));

  for (const body of [
    '{"errors":[{"message":"Email invalid"}]}',
    '{"errors":["Invalid"]}',
    '{"errors":{"email":"Invalid"}}',
    '{"error":"Invalid"}',
    '{"data":{"applyToJobPosting":{"success":false}}}',
    '{"data":{"applyToJobPosting":{"success":true,"validationErrors":[{"field":"email"}]}}}',
    '{"data":{"applyToJobPosting":{"applicationId":"x","userErrors":["invalid"]}}}',
    '{"data":{"applyToJobPosting":{"__typename":"ApplicationSubmissionError","success":true}}}',
    '{"data":{"applyToJobPosting":{"success":true,"requiresVerification":true}}}',
    '{"data":{"applyToJobPosting":{"success":true,"securityCodeRequired":true}}}',
    '{"data":{"applyToJobPosting":{"applicationId":"draft-id","state":"draft"}}}',
    '{"data":{"applyToJobPosting":{"success":true,"message":"Please verify your email"}}}',
  ]) {
    const result = verifySubmissionResponse("ashby", job, { ...accepted, body });
    assert.equal(result.rejected, true, body);
    assert.equal(result.receipt, undefined);
  }
  assert.equal(verifySubmissionResponse("ashby", job, { ...accepted, status: 422 }).rejected, true);
  assert.equal(verifySubmissionResponse("ashby", job, { ...accepted, status: 500 }).rejected, true);
  const explicitMutation = JSON.stringify({ operationName: "ApplyToJobPosting", variables: { jobPostingId: "job-123" }, query: "mutation ApplyToJobPosting($jobPostingId: ID!) { applyToJobPosting(jobPostingId: $jobPostingId) { success } }" });
  assert.ok(verifySubmissionResponse("ashby", job, { ...accepted, postData: explicitMutation }).receipt);
  const apiMutation = JSON.stringify({ operationName: "ApiJobBoardApplicationFormSubmit", variables: { input: { jobPostingId: "job-123" } } });
  assert.ok(verifySubmissionResponse("ashby", job, { ...accepted, postData: apiMutation, body: '{"data":{"jobBoardApplicationFormSubmit":{"success":true}}}' }).receipt);
  console.log("ATS structured receipt: unrelated requests, wrong job/host, missing bodies and application errors rejected.");
}

const restFixtures = [
  ["greenhouse", "https://boards.greenhouse.io/acme/jobs/123", "https://boards.greenhouse.io/embed/acme/jobs/123"],
  ["lever", "https://jobs.lever.co/acme/job-123", "https://jobs.lever.co/acme/job-123/apply"],
  ["workable", "https://apply.workable.com/acme/j/job-123", "https://apply.workable.com/api/v3/accounts/acme/jobs/job-123/applications"],
  ["recruitee", "https://acme.recruitee.com/o/job-123", "https://acme.recruitee.com/api/offers/job-123/candidates"],
  ["personio", "https://acme.jobs.personio.de/job/123", "https://acme.jobs.personio.de/job/123/apply"],
  ["teamtailor", "https://acme.teamtailor.com/jobs/123-engineer", "https://acme.teamtailor.com/jobs/123/applications"],
  ["bamboohr", "https://acme.bamboohr.com/careers/123", "https://acme.bamboohr.com/careers/123/apply"],
  ["breezy", "https://acme.breezy.hr/p/job-123", "https://acme.breezy.hr/p/job-123/apply"],
  ["pinpoint", "https://acme.pinpointhq.com/postings/job-123", "https://acme.pinpointhq.com/postings/job-123/applications"],
  ["smartrecruiters", "https://jobs.smartrecruiters.com/acme/123-engineer", "https://api.smartrecruiters.com/postings/123/applications"],
];
function testOtherProviders() {
  for (const [provider, jobUrl, url] of restFixtures) {
    const response = { url, method: "POST", postData: null, status: 201, body: '{"application":{"id":"receipt-456"}}' };
    assert.ok(verifySubmissionResponse(provider, jobUrl, response).receipt, provider);
    assert.equal(verifySubmissionResponse(provider, jobUrl, { ...response, body: '{"success":false}' }).rejected, true, provider);
    assert.equal(verifySubmissionResponse(provider, jobUrl, { ...response, body: null }).receipt, undefined, provider);
    assert.equal(verifySubmissionResponse(provider, jobUrl, { ...response, url: url.replace(/\/123(?=\/|$)|\/job-123(?=\/|$)/, "/other-job") }).receipt, undefined, `${provider}: wrong job`);
    assert.equal(verifySubmissionResponse(provider, jobUrl, { ...response, url: new URL(url).origin + "/uploads", body: '{"success":true}' }).receipt, undefined, `${provider}: uploads`);
    assert.equal(verifySubmissionResponse(provider, jobUrl, { ...response, url: new URL(url).origin + "/analytics", body: '{"success":true}' }).receipt, undefined, `${provider}: analytics`);
  }
  assert.equal(matchSubmissionRequest("workable", restFixtures[2][1], { url: "https://s3.amazonaws.com/jobs/job-123/applications", method: "POST", postData: null }), null);
  assert.ok(verifySubmissionResponse("recruitee", restFixtures[3][1], { url: restFixtures[3][2], method: "POST", postData: null, status: 201, body: '{"candidate":{"id":42}}' }).receipt);
  assert.ok(matchSubmissionRequest("greenhouse", restFixtures[0][1], { url: "https://boards.greenhouse.io/embed/job_app/submit", method: "POST", postData: "job_id=123&first_name=Applicant" }));
  assert.equal(matchSubmissionRequest("greenhouse", restFixtures[0][1], { url: "https://boards.greenhouse.io/embed/job_app/submit", method: "POST", postData: "cover_letter=123" }), null);
  assert.equal(matchSubmissionRequest("greenhouse", restFixtures[0][1], { url: "https://boards.greenhouse.io/123/jobs/456", method: "POST", postData: "job_id=123" }), null, "The job ID must be in the job slot, not a tenant or unrelated path segment");
  assert.equal(matchSubmissionRequest("ashby", job, { ...ashbyRequest, postData: JSON.stringify({ operationName: "ApplyToJobPosting", variables: { jobPostingId: "JOB-123" } }) }), null, "Job identifiers are not case-folded");
  console.log("All 11 ATS providers require a known application write and exact job association.");
}
function testDomReceipts() {
  assert.equal(verifyPageReceipt("ashby", job, before, after)?.kind, "dom");
  for (const [a, b] of [
    [{ ...before, receiptText: after.receiptText }, after],
    [before, { ...after, formVisible: true }],
    [before, { ...after, receiptText: "Thank you for your interest" }],
    [before, { ...after, receiptText: "Your resume uploaded successfully" }],
    [before, { ...after, receiptText: "Once your application has been submitted, we'll email you" }],
    [before, { ...after, receiptText: "Your application was not submitted" }],
    [before, { ...after, receiptText: "", url: job + "/success" }],
    [before, { ...after, url: "https://attacker.test/success" }],
    [before, { ...after, url: "https://jobs.ashbyhq.com/acme/other-job/success" }],
    [{ ...before, readable: false }, after],
    [before, { ...after, readable: false }],
    [{ ...before, url: "https://jobs.ashbyhq.com/acme/other-job" }, { ...after, url: "https://jobs.ashbyhq.com/acme/thanks" }],
    [{ ...before, formVisible: false }, after],
  ] as [PageReceiptSnapshot, PageReceiptSnapshot][]) assert.equal(verifyPageReceipt("ashby", job, a, b), null, JSON.stringify([a,b]));
  console.log("DOM receipts require a newly visible, affirmative receipt and removal of the actual form.");
}

class MockPage extends EventEmitter {
  phase: "before" | "after" = "before";
  clicks = 0;
  codeVisible = false;
  captchaVisible = false;
  snapshots = { before: { ...before }, after: { ...before } };
  events: Array<{ response: SubmissionResponse; started?: boolean; bodyFails?: boolean }> = [];
  url() { return this.snapshots[this.phase].url; }
  async evaluate(argument: unknown) { return typeof argument === "string" ? this.snapshots[this.phase] : true; }
  async goto() {}
  async waitForLoadState() {}
  async waitForTimeout() {}
  locator(selector: string): any {
    const isCaptcha = /recaptcha|hcaptcha|turnstile|grecaptcha/.test(selector);
    const isCode = selector === securityCode.SECURITY_CODE_FIELD;
    const locator = {
      first: () => locator, nth: () => locator,
      count: async () => isCaptcha ? (this.captchaVisible ? 1 : 0) : 1,
      isVisible: async () => isCode ? this.codeVisible : isCaptcha ? this.captchaVisible : true,
      waitFor: async () => {}, fill: async () => {}, check: async () => {}, setInputFiles: async () => {},
      scrollIntoViewIfNeeded: async () => {}, click: async () => {}, innerText: async () => "",
    };
    return locator;
  }
  async click() {
    this.clicks++;
    this.phase = "after";
    for (const item of this.events) {
      const r = item.response;
      const request = { url: () => r.url, method: () => r.method, postData: () => r.postData } as Request;
      if (item.started !== false) this.emit("request", request);
      const response = { request: () => request, url: () => r.url, status: () => r.status, text: async () => {
        if (item.bodyFails) throw Error("Body unavailable");
        return r.body ?? "";
      } } as Response;
      this.emit("response", response);
    }
  }
  asPage() { return this as unknown as Page; }
}
async function testClickObservation() {
  let page = new MockPage();
  page.events = [{ response: { ...accepted, postData: JSON.stringify({ operationName: "TrackClick", variables: { jobPostingId: "job-123" } }) } }, { response: accepted }];
  let result = await observeSubmission(page.asPage(), "ashby", job, () => page.click());
  assert.equal(result.outcome.ok, true);
  assert.equal(page.clicks, 1);
  assert.equal(page.listenerCount("response"), 0);
  assert.equal(page.listenerCount("request"), 0);

  for (const events of [
    [{ response: accepted, started: false }], // request began before this click
    [{ response: accepted, bodyFails: true }],
    [{ response: { ...accepted, body: null } }],
    [{ response: { ...accepted, body: '{"errors":["invalid email"]}' } }],
    [{ response: { ...accepted, postData: '{"operationName":"Analytics"}' } }],
  ]) {
    page = new MockPage(); page.events = events;
    result = await observeSubmission(page.asPage(), "ashby", job, () => page.click());
    assert.equal(result.outcome.ok, false);
    assert.equal(result.outcome.status, "submission_unconfirmed");
    assert.equal(page.clicks, 1);
  }
  page = new MockPage(); page.snapshots.after = { ...after };
  result = await observeSubmission(page.asPage(), "ashby", job, () => page.click());
  assert.equal(result.outcome.ok && result.outcome.receipt?.kind, "dom");
  page = new MockPage(); page.snapshots.after = { ...after }; page.events = [{ response: { ...accepted, body: '{"success":false}' } }];
  assert.equal((await observeSubmission(page.asPage(), "ashby", job, () => page.click())).outcome.ok, false, "Errors cannot be rescued by a DOM receipt");
  page = new MockPage(); page.events = [{ response: accepted }]; page.captchaVisible = true;
  assert.equal((await observeSubmission(page.asPage(), "ashby", job, () => page.click())).outcome.status, "captcha");
  assert.equal(page.clicks, 0, "Interactive captcha must stay user-owned");
  page = new MockPage(); page.events = [{ response: accepted }];
  assert.equal((await observeSubmission(page.asPage(), "ashby", job, async () => { await page.click(); page.captchaVisible = true; })).outcome.status, "captcha");
  assert.equal(page.clicks, 1, "A challenge appearing after submit must not trigger a second click");
  page = new MockPage(); page.events = [{ response: accepted }]; page.codeVisible = true;
  assert.equal((await observeSubmission(page.asPage(), "ashby", job, () => page.click())).outcome.ok, false, "OTP prompt is not acceptance");
  page = new MockPage();
  result = await observeSubmission(page.asPage(), "ashby", job, async () => { await page.click(); throw Error("Navigation timeout after dispatch"); });
  assert.equal(result.outcome.ok, false);
  assert.equal(page.clicks, 1, "A timeout must never force-click the submit a second time");
  for (const gate of [async () => false, async () => { throw Error("Gate unavailable"); }]) {
    page = new MockPage();
    result = await observeSubmission(page.asPage(), "ashby", job, () => page.click(), gate);
    assert.equal(result.outcome.ok, false); assert.equal(page.clicks, 0);
    assert.equal(page.listenerCount("request"), 0); assert.equal(page.listenerCount("response"), 0);
  }
  console.log("Mock browser: pre-click responses ignored; single dispatch, captcha/OTP and fresh-gate safeguards passed.");
}

function loadAdapter(name: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const source = readFileSync(`src/lib/portal-adapters/${name}.ts`, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} as any };
  vm.runInNewContext(output, {
    module, exports: module.exports, Date, URL, process: { env: {} },
    console: { log() {}, warn() {}, error() {} },
    require: (id: string) => { assert.ok(id in dependencies, `Unexpected dependency/network boundary ${id}`); return dependencies[id]; },
    ...globals,
  });
  return module.exports;
}
async function testRealAshbyAndOtp() {
  const deps = {
    "./submission-proof": proofModule,
    "./captcha": captcha,
    "../application-security-code": securityCode,
    "./submit-button": { findSubmitButton: async (page: MockPage) => ({ click: () => page.click() }) },
    "./generic-fill": { fillCustomQuestions: async () => ({ filled: 0, matched: [] }) },
    "./web-form": { prepareRequiredAnswers: async () => null },
  };
  const { ashbyAdapter } = loadAdapter("ashby", deps);
  for (const [response, success] of [[accepted, true], [{ ...accepted, body: '{"errors":["invalid"]}' }, false], [{ ...accepted, body: null }, false], [{ ...accepted, postData: '{"operationName":"Analytics"}' }, false]] as const) {
    const page = new MockPage(); page.events = [{ response }];
    const result = await ashbyAdapter.apply(page, {
      jobUrl: job, profile: { firstName: "Test", lastName: "Applicant", links: [] },
      userEmail: "private@example.test", cvLocalPath: "/fake/cv.pdf", dryRun: false,
    });
    assert.equal(result.ok, success); assert.equal(page.clicks, 1);
    if (success) assert.ok(result.receipt);
  }
  const { submitWithSecurityCode } = loadAdapter("greenhouse", deps);
  let reads = 0;
  const page = new MockPage(); page.codeVisible = true;
  page.snapshots.before.url = restFixtures[0][1]; page.snapshots.after.url = restFixtures[0][1];
  page.events = [{ response: { url: restFixtures[0][2], method: "POST", postData: null, status: 200, body: '{"applicationId":"otp-receipt"}' } }];
  const originalClick = page.click.bind(page);
  page.click = async () => { page.codeVisible = false; await originalClick(); };
  const result = await submitWithSecurityCode(page, "test-application", new Date(), async () => {
    reads++; return [{ fromAddress: "no-reply@us.greenhouse-mail.io", subject: "Security code", bodyText: "Your security code is AbCd1234." }];
  }, restFixtures[0][1]);
  assert.equal(reads, 1, "Supplied mailbox reader must be used instead of live Prisma");
  assert.equal(result.ok, true); assert.equal(result.receipt.receiptId, "otp-receipt"); assert.equal(page.clicks, 1);
  const pausedPage = new MockPage(); pausedPage.codeVisible = true;
  pausedPage.snapshots.before.url = restFixtures[0][1];
  const paused = await submitWithSecurityCode(pausedPage, "test-application", new Date(), async () => [{
    fromAddress: "no-reply@us.greenhouse-mail.io", subject: "Security code", bodyText: "Your security code is AbCd1234.",
  }], restFixtures[0][1], async () => false);
  assert.equal(paused.ok, false); assert.equal(pausedPage.clicks, 0, "Gate must run again before OTP finalization");
  console.log("Real Ashby apply and Greenhouse OTP adapter paths passed with isolated browser/mailbox dependencies.");
}

async function testRecruiteeBoundary() {
  for (const scenario of ["receipt", "boolean-no", "unanswered", "error", "empty", "rejected", "timeout", "paused", "gate-error", "lookup-error", "not-an-offer"]) {
    let posts = 0;
    const formValues = new Map<string, unknown>();
    const { recruiteeAdapter } = loadAdapter("recruitee", {
      "./submission-proof": proofModule,
      "node:fs/promises": { readFile: async () => new Uint8Array([1, 2, 3]) },
      "./ai-answer": { answerOffline: async (_ctx: unknown, fields: Array<{ kind: string; options: string[] }>) => {
        if (scenario === "boolean-no") { assert.equal(fields[0].kind, "radio"); assert.equal(fields[0].options.join(","), "Yes,No"); }
        return { given: [], answers: new Map(scenario === "boolean-no" ? [[0, "No"]] : []) };
      } },
      "./web-form": { buildAnswerContext: () => ({}) },
    }, {
      FormData: class { set(name: string, value: unknown) { formValues.set(name, value); } }, Blob: class {},
      AbortSignal: { timeout: () => ({}) },
      fetch: async (url: string, options: { method?: string; redirect?: string }) => {
        assert.ok(url.startsWith("https://acme.recruitee.com/api/offers/job-123"));
        if (options.method !== "POST") return {
          status: scenario === "lookup-error" ? 500 : 200,
          ok: scenario !== "lookup-error",
          json: async () => scenario === "not-an-offer" ? {} : { offer: { status: "published", open_questions: ["boolean-no", "unanswered"].includes(scenario) ? [{ id: 17, kind: "boolean", body: "Do you need visa sponsorship?", required: true }] : [] } },
        };
        posts++;
        assert.equal(options.redirect, "error");
        if (scenario === "timeout") throw Error("Timed out after dispatch");
        return {
          status: scenario === "rejected" ? 422 : scenario === "empty" ? 204 : 201,
          text: async () => scenario === "error" ? '{"errors":{"email":"Invalid"}}' : scenario === "empty" ? "" : '{"candidate":{"id":"recruitee-receipt"}}',
        };
      },
    });
    const outcome = await recruiteeAdapter.apply({}, {
      jobUrl: restFixtures[3][1], profile: { firstName: "Test", lastName: "Applicant" },
      userEmail: "private@example.test", cvLocalPath: "/mock/cv.pdf", coverLetterText: "", dryRun: false,
      beforeSubmit: async () => {
        if (scenario === "gate-error") throw Error("Cannot authorize");
        return scenario !== "paused";
      },
    });
    assert.equal(outcome.ok, ["receipt", "boolean-no"].includes(scenario), scenario);
    if (scenario === "unanswered") { assert.equal(outcome.status, "needs_user_input"); assert.equal(formValues.size, 0, "No candidate payload constructed before the missing-answer return"); }
    if (scenario === "boolean-no") assert.equal(formValues.get("candidate[open_question_answers_attributes][0][flag]"), "false", "An explicit No must stay false for required API booleans");
    assert.equal(posts, ["unanswered", "paused", "gate-error", "lookup-error", "not-an-offer"].includes(scenario) ? 0 : 1, scenario);
    if (outcome.ok) assert.equal(outcome.receipt.receiptId, "recruitee-receipt");
  }
  console.log("Real Recruitee adapter: receipt/error/empty/timeout and final-gate paths passed with isolated HTTP/files.");
}

function testNoLegacySuccessBypass() {
  for (const name of ["ashby", "greenhouse", "lever", "workable", "smartrecruiters", "web-form"]) {
    const source = readFileSync(`src/lib/portal-adapters/${name}.ts`, "utf8");
    assert.ok(source.includes("observeSubmission("), name);
    assert.ok(source.includes("input.beforeSubmit"), name);
    assert.ok(!source.includes("waitForResponse("), `${name}: old broad interception must be removed`);
    assert.ok(!/confirmation:\s*(?:soft|confirmed)|any2xx|detectedStatus/.test(source), `${name}: no legacy success bypass`);
    assert.equal((source.match(/ok: true/g) ?? []).length, 1, `${name}: the only direct success is explicitly DRY_RUN`);
  }
  const recruitee = readFileSync("src/lib/portal-adapters/recruitee.ts", "utf8");
  assert.ok(recruitee.includes("verifySubmissionResponse("));
  assert.ok(recruitee.includes("input.beforeSubmit"));
  assert.ok(recruitee.includes('redirect: "error"'), "Do not send candidate data through an unverified redirect");
}

async function main() {
  testResponses(); testOtherProviders(); testDomReceipts();
  await testClickObservation(); await testRealAshbyAndOtp(); await testRecruiteeBoundary(); testNoLegacySuccessBypass();
  console.log("ATS submission-proof regression suite passed (no external sends or network).");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
