/**
 * Mocked regression tests for the 20 Oct 2026 18:00 run (no network, no DB,
 * no real submission): Ashby receipt, Greenhouse blank-form pause, captcha
 * handoff, official ATS API receipts, Domande pre-fill aliases.
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { observeSubmission, verifySubmissionResponse } from "../src/lib/portal-adapters/submission-proof";
import { parseVerifiedSubmissionReceipt } from "../src/lib/submission-receipt";
import { verifyOfficialApiResponse, submitViaOfficialApi, employerApiKey, boardSlug } from "../src/lib/ats-official-api";
import { captchaHandoff } from "../src/lib/captcha-handoff";
import { reusableFactKey } from "../src/lib/candidate-facts";
import { greenhouseAdapter } from "../src/lib/portal-adapters/greenhouse";
import { challengeAppearedAfterSubmit, detectBlockingCaptcha } from "../src/lib/portal-adapters/captcha";
import { DEFAULT_SKIP_PORTAL_HOSTS } from "../src/lib/ats-skip-hosts";
import { networkEvidence } from "../src/lib/portal-adapters/submit-evidence";
import { ashbyContactFromProfile } from "../src/lib/portal-adapters/ashby-contact";
import { preferredDeliveryChannel } from "../src/lib/delivery-channel";

const ASHBY_JOB = "https://jobs.ashbyhq.com/elevenlabs/e4e0450f-d139-4f8e-b210-2f326a680d90";
const ASHBY_POSTING = "e4e0450f-d139-4f8e-b210-2f326a680d90";
const ASHBY_ENDPOINT = "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiSubmitSingleApplicationFormAction";
// Shape taken from the live jobs.ashbyhq.com frontend bundle (Oct 2026).
const ashbyRequest = JSON.stringify({
  operationName: "ApiSubmitSingleApplicationFormAction",
  variables: { organizationHostedJobsPageName: "elevenlabs", jobPostingId: ASHBY_POSTING, formRenderIdentifier: "f1",
    actionIdentifier: "submit", recaptchaToken: "tok", applicationRequestId: "4b8c9a1e-0f7e-4d0b-9a55-1c2d3e4f5a6b" },
  query: "mutation ApiSubmitSingleApplicationFormAction($organizationHostedJobsPageName: String!, $jobPostingId: String!) {\n  submitSingleApplicationFormAction(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) {\n    applicationFormResult { __typename }\n    messages { blockMessageForCandidateHtml }\n  }\n}",
});
const ashbyBody = (result: unknown, block: string | null = null) => JSON.stringify({ data: { submitSingleApplicationFormAction: {
  applicationFormResult: result, messages: { blockMessageForCandidateHtml: block, __typename: "ApplicationFormMessages" }, __typename: "SubmitApplicationFormActionResult" } } });
const SUCCESS = { __typename: "FormSubmitSuccess", _: null };
const FORM_RENDER = { __typename: "FormRender", id: "x", errorMessages: ["Resume is required"], formErrors: [{ message: "Resume is required", fieldEntryId: "e1" }] };

let passed = 0;
async function test(name: string, fn: () => unknown | Promise<unknown>) { await fn(); passed++; console.log(`  ok ${name}`); }

async function main() {
console.log("ats-submit-reliability");

// ---------- A/B: Ashby browser receipt ----------
await test("Ashby FormSubmitSuccess on the real mutation is a definitive receipt", () => {
  const r = verifySubmissionResponse("ashby", ASHBY_JOB, { url: ASHBY_ENDPOINT, method: "POST", postData: ashbyRequest, status: 200, body: ashbyBody(SUCCESS) });
  assert.equal(r.rejected, false);
  assert.ok(r.receipt, "receipt expected");
  assert.equal(r.receipt!.signal, "form_submit_success");
  assert.equal(r.receipt!.receiptId, "4b8c9a1e-0f7e-4d0b-9a55-1c2d3e4f5a6b");
  assert.equal(r.receipt!.jobId, ASHBY_POSTING);
  assert.ok(parseVerifiedSubmissionReceipt(JSON.stringify(r.receipt), "portal_ashby"), "worker/display must accept the receipt");
});
await test("Ashby FormRender (validation errors) is rejected, never success", () => {
  const r = verifySubmissionResponse("ashby", ASHBY_JOB, { url: ASHBY_ENDPOINT, method: "POST", postData: ashbyRequest, status: 200, body: ashbyBody(FORM_RENDER) });
  assert.equal(r.rejected, true); assert.equal(r.receipt, undefined);
});
await test("Ashby block message for candidate is rejected", () => {
  const r = verifySubmissionResponse("ashby", ASHBY_JOB, { url: ASHBY_ENDPOINT, method: "POST", postData: ashbyRequest, status: 200, body: ashbyBody(SUCCESS, "<p>We could not accept this application</p>") });
  assert.equal(r.rejected, true);
});
await test("Ashby success for ANOTHER posting is not a receipt for this job", () => {
  const other = ashbyRequest.replace(ASHBY_POSTING, "11111111-2222-3333-4444-555555555555");
  const r = verifySubmissionResponse("ashby", ASHBY_JOB, { url: ASHBY_ENDPOINT, method: "POST", postData: other, status: 200, body: ashbyBody(SUCCESS) });
  assert.equal(r.receipt, undefined);
});

// Fake Playwright page: the click emits the Ashby request/response pair.
function fakePage(opts: { body: string; status?: number; formVisibleAfter?: boolean; badge?: boolean }) {
  const ev = new EventEmitter();
  let clicked = false;
  const locator = (sel?: string) => ({
    count: async () => (opts.badge && sel && sel.includes("grecaptcha-badge") ? 1 : 0),
    nth: () => ({ isVisible: async () => !!(opts.badge && sel && sel.includes("grecaptcha-badge")) }),
    first: () => ({ isVisible: async () => false }),
    innerText: async () => (sel === "body" ? "Grazie per la candidatura. We received your application." : ""),
  });
  const page = {
    url: () => `${ASHBY_JOB}/application`,
    on: (n: string, f: (...a: unknown[]) => void) => ev.on(n, f),
    off: (n: string, f: (...a: unknown[]) => void) => ev.off(n, f),
    evaluate: async () => ({ receiptText: "", formVisible: clicked ? opts.formVisibleAfter ?? true : true, readable: true }),
    locator,
    screenshot: async () => Buffer.from("png"),
    waitForLoadState: async () => undefined,
    waitForTimeout: async () => undefined,
  };
  const click = async () => {
    clicked = true;
    const request = { url: () => ASHBY_ENDPOINT, method: () => "POST", postData: () => ashbyRequest };
    ev.emit("request", request);
    ev.emit("response", { request: () => request, url: () => ASHBY_ENDPOINT, status: () => opts.status ?? 200, text: async () => opts.body });
  };
  return { page: page as unknown as import("playwright").Page, click };
}
await test("observeSubmission: Ashby click with FormSubmitSuccess → submitted + DETECTED_HTTP_200 (no false UNCONFIRMED)", async () => {
  const { page, click } = fakePage({ body: ashbyBody(SUCCESS) });
  const { outcome } = await observeSubmission(page, "ashby", ASHBY_JOB, click, async () => true);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.ok && outcome.confirmation, "DETECTED_HTTP_200");
  assert.equal(outcome.ok && outcome.receipt?.provider, "ashby");
  assert.ok(outcome.canary, "submit evidence is always persisted");
  assert.equal(outcome.canary!.submitResponses?.length, 1);
  assert.equal(outcome.canary!.submitResponses?.[0].operation, "ApiSubmitSingleApplicationFormAction");
  assert.equal(outcome.canary!.submitResponses?.[0].httpStatus, 200);
  assert.ok((outcome.canary!.submitResponses?.[0].body?.length ?? 0) > 0);
  assert.match(outcome.canary!.bodyTextAfterSubmit, /Grazie per la candidatura/);
  assert.equal(outcome.canary!.postSubmitScreenshotUrl, null, "no Blob token → screenshot skipped");
});
await test("observeSubmission: Ashby FormRender → rejected-not-sent (validation, no acceptance)", async () => {
  const { page, click } = fakePage({ body: ashbyBody(FORM_RENDER) });
  const { outcome } = await observeSubmission(page, "ashby", ASHBY_JOB, click, async () => true);
  assert.equal(outcome.ok, false);
  assert.equal(!outcome.ok && outcome.status, "validation_failed");
  assert.match(!outcome.ok ? outcome.error : "", /rifiutato|validazione/i);
  assert.equal(outcome.attemptEvidence?.destinationResponse?.rejected, true);
});

// ---------- A/B: official employer APIs ----------
const GH_JOB = "https://boards.greenhouse.io/doctolib/jobs/8000653003";
await test("official Ashby applicationForm.submit success with id → application_id receipt", () => {
  const r = verifyOfficialApiResponse("ashby", ASHBY_JOB, "https://api.ashbyhq.com/applicationForm.submit", 200,
    JSON.stringify({ success: true, results: { submittedFormInstance: { id: "7a3d9986-a88a-49f4-b363-8da21b893e30" }, formMessages: { blocked: false } } }));
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.receipt.receiptId, "7a3d9986-a88a-49f4-b363-8da21b893e30");
  assert.ok(r.ok && parseVerifiedSubmissionReceipt(JSON.stringify(r.receipt), "portal_ashby"));
});
await test("official Ashby errors / blocked / 2xx without id are never success", () => {
  const ep = "https://api.ashbyhq.com/applicationForm.submit";
  assert.deepEqual(verifyOfficialApiResponse("ashby", ASHBY_JOB, ep, 200, JSON.stringify({ success: false, errors: [{ message: "x" }] })).ok, false);
  assert.equal(verifyOfficialApiResponse("ashby", ASHBY_JOB, ep, 200, JSON.stringify({ success: true, results: { submittedFormInstance: { id: "a1" }, formMessages: { blocked: true } } })).ok, false);
  const noId = verifyOfficialApiResponse("ashby", ASHBY_JOB, ep, 200, JSON.stringify({ success: true, results: {} }));
  assert.equal(noId.ok, false); assert.equal(!noId.ok && noId.rejected, false);
  assert.equal(verifyOfficialApiResponse("ashby", ASHBY_JOB, ep, 401, "{}").ok, false);
});
await test("official Greenhouse Job Board API success → accepted receipt; validation error → rejected", () => {
  const ep = "https://boards-api.greenhouse.io/v1/boards/doctolib/jobs/8000653003";
  const ok = verifyOfficialApiResponse("greenhouse", GH_JOB, ep, 200, JSON.stringify({ success: "Candidate saved successfully" }));
  assert.equal(ok.ok, true);
  assert.ok(ok.ok && parseVerifiedSubmissionReceipt(JSON.stringify(ok.receipt), "portal_greenhouse"));
  const withId = verifyOfficialApiResponse("greenhouse", GH_JOB, ep, 200, JSON.stringify({ application_id: 123456 }));
  assert.equal(withId.ok && withId.receipt.receiptId, "123456");
  const bad = verifyOfficialApiResponse("greenhouse", GH_JOB, ep, 422, JSON.stringify({ error: "first_name missing" }));
  assert.equal(bad.ok, false); assert.equal(!bad.ok && bad.rejected, true);
});
await test("submitViaOfficialApi: one mocked POST with employer Basic auth, never a real network call", async () => {
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const r = await submitViaOfficialApi({ provider: "greenhouse", jobUrl: GH_JOB, apiKey: "k3y", payload: { first_name: "A" },
    fetchImpl: async (url, init) => { calls.push({ url, headers: init.headers, body: init.body }); return { status: 200, text: async () => JSON.stringify({ success: "Candidate saved successfully" }) }; } });
  assert.equal(r.ok, true); assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://boards-api.greenhouse.io/v1/boards/doctolib/jobs/8000653003");
  assert.equal(calls[0].headers.Authorization, `Basic ${Buffer.from("k3y:").toString("base64")}`);
  const failing = await submitViaOfficialApi({ provider: "ashby", jobUrl: ASHBY_JOB, apiKey: "k", payload: {}, fetchImpl: async () => { throw new Error("timeout"); } });
  assert.equal(failing.ok, false); assert.equal(!failing.ok && failing.rejected, false, "a network error is ambiguous, not a rejection");
});
await test("employer keys are per board and absent by default", () => {
  assert.equal(boardSlug("ashby", ASHBY_JOB), "elevenlabs");
  assert.equal(boardSlug("greenhouse", GH_JOB), "doctolib");
  assert.equal(employerApiKey("ashby", ASHBY_JOB, {}), null);
  assert.equal(employerApiKey("ashby", ASHBY_JOB, { ATS_EMPLOYER_API_KEYS: JSON.stringify({ "ashby:elevenlabs": "k" }) }), "k");
  assert.equal(employerApiKey("greenhouse", GH_JOB, { ATS_EMPLOYER_API_KEYS: JSON.stringify({ "ashby:elevenlabs": "k" }) }), null);
  assert.equal(employerApiKey("ashby", ASHBY_JOB, { ATS_EMPLOYER_API_KEYS: "not json" }), null);
});

// ---------- Greenhouse blank-form pause without consent ----------
await test("Greenhouse: unattestable pause before any data → needs_user_input (not UNCONFIRMED), nothing typed", async () => {
  const filled: string[] = [];
  const el = { waitFor: async () => undefined, fill: async (v: string) => { filled.push(v); }, count: async () => 1, isVisible: async () => true, click: async () => undefined, setInputFiles: async () => { filled.push("file"); } };
  const page = {
    goto: async () => null, url: () => GH_JOB,
    locator: () => ({ ...el, first: () => el, nth: () => el }),
    waitForLoadState: async () => undefined, waitForTimeout: async () => undefined,
    evaluate: async () => [{ idx: 0, label: "Which school or university are you currently enrolled in?", kind: "text" }],
  } as unknown as import("playwright").Page;
  let candidateDataCalled = false;
  const outcome = await greenhouseAdapter.apply(page, {
    jobUrl: GH_JOB, userEmail: "test@example.com", cvLocalPath: "/tmp/cv.docx", clLocalPath: "/tmp/cl.docx", coverLetterText: "",
    profile: { firstName: "A", lastName: "B", email: "test@example.com", phone: "", city: "", summary: "", links: [], experiences: [], education: [], skills: [], languages: [], certifications: [] } as never, reusableAnswers: [],
    answers: {} as never, storedAnswers: [] as never,
    onPreTransmissionPause: async () => false,
    beforeCandidateData: async () => { candidateDataCalled = true; return true; },
    beforeSubmit: async () => false,
  } as never);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.status, "needs_user_input", "error" in outcome ? outcome.error : "");
  assert.equal(outcome.status === "needs_user_input" && outcome.pendingQuestions.length, 1);
  assert.equal(filled.length, 0, "no candidate data may be entered");
  assert.equal(candidateDataCalled, false);
});

// ---------- C: captcha (HTML fixtures from the Oct 2026 Greenhouse diagnostic) ----------
type CaptchaFixture = {
  badge?: boolean;
  invisibleWidget?: boolean;
  bframe?: boolean;
  checkboxAnchor?: boolean;
  hcaptcha?: boolean;
  turnstile?: boolean;
  robotText?: boolean;
};

function captchaPage(fx: CaptchaFixture) {
  const hit = (sel: string): boolean => {
    if (sel.includes("bframe") || (sel.includes("challenge") && sel.includes("recaptcha"))) return !!fx.bframe;
    if (sel.includes("grecaptcha-badge")) return !!fx.badge;
    if (sel.includes("anchor") && sel.includes("g-recaptcha")) return !!fx.checkboxAnchor;
    if (sel.includes('data-size="invisible"') && !sel.includes(":not")) return !!fx.invisibleWidget;
    if (/hcaptcha|h-captcha/.test(sel)) return !!fx.hcaptcha;
    if (/turnstile/.test(sel)) return !!fx.turnstile;
    if (/robot/i.test(sel)) return !!fx.robotText;
    return false;
  };
  return {
    locator: (sel: string) => {
      const on = hit(sel);
      return {
        count: async () => on ? 1 : 0,
        nth: () => ({ isVisible: async () => on }),
        first: () => ({ isVisible: async () => on }),
      };
    },
  } as never;
}

await test("invisible reCAPTCHA badge is reported but not blocking (no visible challenge)", async () => {
  const r = await detectBlockingCaptcha(captchaPage({ badge: true }));
  assert.equal(r.blocking, false);
  assert.equal(r.kind, "recaptcha_invisible_badge");
  assert.equal(await challengeAppearedAfterSubmit(captchaPage({ badge: true })), false);
});
await test("badge-only Greenhouse HTML (enterprise.js?render=, 256x60, no sitekey) is not blocking", async () => {
  const r = await detectBlockingCaptcha(captchaPage({ badge: true, invisibleWidget: false }));
  assert.equal(r.blocking, false);
  assert.equal(r.kind, "recaptcha_invisible_badge");
});
await test("visible reCAPTCHA challenge iframe is blocking", async () => {
  const r = await detectBlockingCaptcha(captchaPage({ badge: true, bframe: true }));
  assert.equal(r.blocking, true);
  assert.equal(r.kind, "recaptcha_challenge");
  assert.equal(await challengeAppearedAfterSubmit(captchaPage({ bframe: true })), true);
});
await test("visible checkbox / I'm not a robot is blocking", async () => {
  const checkbox = await detectBlockingCaptcha(captchaPage({ checkboxAnchor: true }));
  assert.equal(checkbox.blocking, true);
  assert.equal(checkbox.kind, "recaptcha_checkbox");
  const robot = await detectBlockingCaptcha(captchaPage({ robotText: true }));
  assert.equal(robot.blocking, true);
  assert.equal(robot.kind, "recaptcha_checkbox");
});
await test("hCaptcha and Turnstile widgets are blocking", async () => {
  const h = await detectBlockingCaptcha(captchaPage({ hcaptcha: true }));
  assert.equal(h.blocking, true);
  assert.equal(h.kind, "hcaptcha");
  const t = await detectBlockingCaptcha(captchaPage({ turnstile: true }));
  assert.equal(t.blocking, true);
  assert.equal(t.kind, "turnstile");
});
await test("post-click POST with a badge is not captcha (submitted/unconfirmed per evidence)", async () => {
  const { page, click } = fakePage({ body: ashbyBody(SUCCESS), badge: true });
  const { outcome } = await observeSubmission(page, "ashby", ASHBY_JOB, click, async () => true);
  assert.equal(outcome.ok, true);
  assert.notEqual(outcome.ok && outcome.status, "captcha");
  assert.equal(outcome.ok && outcome.confirmation, "DETECTED_HTTP_200");
});
await test("Ashby remains on the skip-list (route policy unchanged)", () => {
  assert.ok(DEFAULT_SKIP_PORTAL_HOSTS.includes("ashbyhq.com"));
  assert.ok(DEFAULT_SKIP_PORTAL_HOSTS.includes("jobs.ashbyhq.com"));
});
await test("captured submit responses keep URL, operation, status, first 2KB", () => {
  const ev = networkEvidence([{
    url: ASHBY_ENDPOINT, postData: ashbyRequest, status: 200, body: "x".repeat(5000),
  }]);
  assert.equal(ev[0].url, ASHBY_ENDPOINT);
  assert.equal(ev[0].operation, "ApiSubmitSingleApplicationFormAction");
  assert.equal(ev[0].httpStatus, 200);
  assert.equal(ev[0].body?.length, 2048);
});
await test("Ashby Name/Phone/LinkedIn fall back to User + answers when CVProfile is sparse", () => {
  const empty = ashbyContactFromProfile({ profile: { firstName: "", lastName: "", phone: "", links: [] } });
  assert.equal(empty.fullName, "");
  const fromUser = ashbyContactFromProfile({
    profile: { firstName: "", lastName: "", phone: "", links: [] },
    userName: "Mario Rossi", userPhone: "+39 333 1234567", linkedinUrl: "https://linkedin.com/in/mario",
  });
  assert.equal(fromUser.fullName, "Mario Rossi");
  assert.equal(fromUser.firstName, "Mario");
  assert.equal(fromUser.lastName, "Rossi");
  assert.equal(fromUser.phone, "+39 333 1234567");
  assert.equal(fromUser.linkedinUrl, "https://linkedin.com/in/mario");
  const fromCv = ashbyContactFromProfile({
    profile: { firstName: "Anna", lastName: "Bianchi", phone: "+39 02 1", links: [{ url: "https://linkedin.com/in/anna", label: "LinkedIn" }] },
    userName: "Ignored", userPhone: "ignored", linkedinUrl: "https://ignored",
  });
  assert.equal(fromCv.fullName, "Anna Bianchi");
  assert.equal(fromCv.phone, "+39 02 1");
  assert.equal(fromCv.linkedinUrl, "https://linkedin.com/in/anna");
});
await test("recruiter email is preferred over portal submit", () => {
  assert.equal(preferredDeliveryChannel({ recruiterEmail: "jobs@acme.com" }), "email_recruiter");
  assert.equal(preferredDeliveryChannel({ recruiterEmail: "  " }), "portal");
  assert.equal(preferredDeliveryChannel({ recruiterEmail: null }), "portal");
});
await test("captcha in full-auto is routed to the manual queue with a notification, not skipped", () => {
  for (const mode of ["auto", "hybrid", "manual", null]) {
    const h = captchaHandoff({ mode, company: "ElevenLabs", adapterLabel: "Ashby", detail: "hcaptcha" });
    assert.equal(h.notifyUser, true);
    assert.equal(h.status, "ready_to_apply");
    assert.equal(h.submitConfirmation, "CAPTCHA");
    assert.doesNotMatch(h.errorMessage, /Saltato/);
    assert.match(h.errorMessage, /Nessuna candidatura è stata inviata/);
    assert.equal(JSON.parse(h.canaryLog).routedTo, "manual_queue");
  }
});

// ---------- D: Domande pre-fill ----------
await test("common Alan questions map to profile facts (pre-fill on Domande)", () => {
  assert.equal(reusableFactKey("Current or last company"), "currentOrPreviousEmployer");
  assert.equal(reusableFactKey("Current location (Country, city)"), "city");
  assert.equal(reusableFactKey("LinkedIn"), "linkedinUrl");
  assert.equal(reusableFactKey("LinkedIn Profile URL"), "linkedinUrl");
  assert.equal(reusableFactKey("Name"), "fullName");
  assert.equal(reusableFactKey("Best Contact Number"), "phone");
  assert.equal(reusableFactKey("Location"), "city");
  assert.equal(reusableFactKey("Available from"), "noticePeriod");
  assert.equal(reusableFactKey("Earliest start date"), "noticePeriod");
  assert.equal(reusableFactKey("Salary expectations"), "salaryExpectationEur");
  assert.equal(reusableFactKey("Where did you hear about us"), "howHeard");
  assert.equal(reusableFactKey("Notice period"), "noticePeriod");
  assert.equal(reusableFactKey("Expected annual salary (EUR)"), "salaryExpectationEur");
  // Free-text motivation / essay questions stay with the candidate.
  assert.equal(reusableFactKey("Describe a specific project that you’re proud of where you had an impact across the stack."), null);
});

console.log(`ats-submit-reliability: ${passed} passed`);
}
main().catch((err) => { console.error(err); process.exit(1); });
