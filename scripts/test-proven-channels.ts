/**
 * Proven-channel pilot: fakes only. Never contacts Greenhouse, DNS, Resend, or prod DB.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.DATABASE_URL ??= "postgresql://synthetic:synthetic@127.0.0.1:59999/test_only";
process.env.DIRECT_URL ??= process.env.DATABASE_URL;

import { applicationDeliveryView } from "../src/lib/application-delivery-view";
import { applyReplyToApplication } from "../src/lib/apply-reply-to-application";
import { deliveryEvidence } from "../src/lib/application-evidence";
import {
  collectGreenhouseQuestions,
  greenhouseAbsoluteUrlIsNative,
  greenhouseRequiredQuestionsAnswerable,
  loadGreenhouseJobForm,
  parseGreenhouseBoardJob,
} from "../src/lib/greenhouse-job-form";
import {
  GREENHOUSE_FORM_FETCH_BUDGET,
  buildProvenChannelFactContext,
  evaluateProvenChannelEligibility,
  greenhouseInboundReady,
  publishedEmployerEmailEligible,
} from "../src/lib/proven-channel-eligibility";
import {
  provenChannelMode,
  provenChannelPilotUserIds,
  usesProvenChannelFilter,
} from "../src/lib/proven-channels";
import { classifyReply } from "../src/lib/reply-parser";

const OWNER = "cmo9z6ueg0000ie042ksa0i31";

function testModeAndAllowList() {
  assert.equal(provenChannelMode({}), "pilot");
  assert.equal(provenChannelMode({ PROVEN_CHANNEL_MODE: "ALL" }), "all");
  assert.equal(provenChannelMode({ PROVEN_CHANNEL_MODE: "off" }), "off");
  assert.equal(provenChannelMode({ PROVEN_CHANNEL_MODE: "weird" }), "pilot");
  assert.deepEqual(provenChannelPilotUserIds({}), []);
  assert.deepEqual(provenChannelPilotUserIds({ PROVEN_CHANNEL_PILOT_USER_IDS: ` ${OWNER}, other ` }), [OWNER, "other"]);
  assert.equal(usesProvenChannelFilter(OWNER, { PROVEN_CHANNEL_MODE: "off", PROVEN_CHANNEL_PILOT_USER_IDS: OWNER }), false);
  assert.equal(usesProvenChannelFilter(OWNER, { PROVEN_CHANNEL_MODE: "pilot" }), false, "empty allow-list restricts nobody");
  assert.equal(usesProvenChannelFilter("someone-else", { PROVEN_CHANNEL_MODE: "pilot", PROVEN_CHANNEL_PILOT_USER_IDS: OWNER }), false);
  assert.equal(usesProvenChannelFilter(OWNER, { PROVEN_CHANNEL_MODE: "pilot", PROVEN_CHANNEL_PILOT_USER_IDS: OWNER }), true);
  assert.equal(usesProvenChannelFilter("anyone", { PROVEN_CHANNEL_MODE: "all" }), true);
  console.log("PASS proven-channel mode / allow-list");
}

function testGreenhouseParseAndQuestions() {
  assert.deepEqual(parseGreenhouseBoardJob("https://boards.greenhouse.io/acme/jobs/99"), { boardToken: "acme", jobId: "99" });
  assert.deepEqual(parseGreenhouseBoardJob("https://job-boards.greenhouse.io/acme/jobs/99"), { boardToken: "acme", jobId: "99" });
  assert.deepEqual(
    parseGreenhouseBoardJob("https://careers.acme.test/jobs?gh_jid=99", "acme"),
    { boardToken: "acme", jobId: "99" },
  );
  assert.equal(parseGreenhouseBoardJob("https://careers.acme.test/jobs?gh_jid=99"), null);
  assert.equal(parseGreenhouseBoardJob("https://jobs.lever.co/acme/abc"), null);
  assert.equal(greenhouseAbsoluteUrlIsNative("https://boards.greenhouse.io/acme/jobs/99"), true);
  assert.equal(greenhouseAbsoluteUrlIsNative("https://careers.acme.test/jobs/99"), false);

  const questions = collectGreenhouseQuestions({
    questions: [
      { label: "First Name", required: true, fields: [{ type: "input_text", name: "first_name" }] },
      { label: "LinkedIn profile", required: true, fields: [{ type: "input_text" }] },
      { label: "Why us?", required: false, fields: [{ type: "textarea" }] },
      { questions: [{ label: "Resume", required: true, fields: [{ type: "input_file" }] }] },
    ],
  });
  assert.deepEqual(questions.map((q) => q.label), ["First Name", "LinkedIn profile", "Why us?", "Resume"]);
  const ctx = {
    facts: [
      { key: "firstName", value: "Ada", source: "cv" as const, reference: "firstName" },
    ],
    storedAnswers: [{ label: "LinkedIn profile", answer: "https://linkedin.com/in/ada" }],
    firstName: "Ada",
    privacyConsentAt: new Date("2026-01-01"),
  };
  assert.equal(greenhouseRequiredQuestionsAnswerable(questions, ctx, { hasCv: true }).ok, true);
  assert.equal(greenhouseRequiredQuestionsAnswerable(questions, { facts: [] }, { hasCv: true }).ok, false);
  console.log("PASS greenhouse parse / truthful required questions");
}

async function testGreenhouseFormCache() {
  let fetches = 0;
  const cache = new Map<string, any>();
  const payload = {
    absolute_url: "https://boards.greenhouse.io/acme/jobs/99",
    questions: [{ label: "First Name", required: true, fields: [{ type: "input_text" }] }],
  };
  const deps = {
    fetch: async (url: string) => {
      fetches += 1;
      assert.match(url, /boards-api\.greenhouse\.io\/v1\/boards\/acme\/jobs\/99\?questions=true/);
      return { ok: true, status: 200, url, json: async () => payload };
    },
    cacheGet: async (key: string) => cache.get(key) ?? null,
    cacheSet: async (row: any) => { cache.set(row.cacheKey, row); },
    now: new Date("2026-10-24T12:00:00Z"),
  };
  const first = await loadGreenhouseJobForm({ url: "https://boards.greenhouse.io/acme/jobs/99" }, deps);
  const second = await loadGreenhouseJobForm({ url: "https://boards.greenhouse.io/acme/jobs/99" }, deps);
  assert.equal(first?.status, "native");
  assert.equal(second?.questions[0]?.label, "First Name");
  assert.equal(fetches, 1, "boards-api result is cached");

  const redirected = await loadGreenhouseJobForm(
    { url: "https://boards.greenhouse.io/other/jobs/1" },
    {
      ...deps,
      fetch: async (url: string) => ({
        ok: true, status: 200, url,
        json: async () => ({ absolute_url: "https://careers.other.test/jobs/1", questions: [] }),
      }),
    },
  );
  assert.equal(redirected?.status, "redirected");
  console.log("PASS greenhouse boards-api cache + redirect skip");
}

async function testEligibility() {
  const env = { INBOUND_EMAIL_DOMAIN: "inbound.lavorai.it" };
  assert.equal(greenhouseInboundReady(env), true);
  assert.equal(greenhouseInboundReady({ INBOUND_ROUTE_ATS_EMAIL: "false", INBOUND_EMAIL_DOMAIN: "inbound.lavorai.it" }), false);
  assert.equal(publishedEmployerEmailEligible({
    url: "https://jobs.ashbyhq.com/acme/role",
    company: "Acme",
    recruiterEmail: "jobs@acme.com",
  }), true);
  assert.equal(publishedEmployerEmailEligible({
    url: "https://jobs.ashbyhq.com/acme/role",
    company: "Acme",
    recruiterEmail: "jobs@gmail.com",
  }), false, "freemail / non-employer domain is not a proven channel");

  const factContext = buildProvenChannelFactContext({
    profile: {
      firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", phone: "+39000",
      city: "Milano", title: "Engineer", summary: "",
      experiencesJson: "[]", educationJson: "[]", skillsJson: "[]", languagesJson: "[]", linksJson: "[]",
    },
    user: { email: "ada@example.test", privacyConsentAt: new Date("2026-01-01") },
  });
  const user = { factContext, hasCv: true };
  const nativeForm = {
    cacheKey: "acme:99", boardToken: "acme", jobId: "99",
    absoluteUrl: "https://boards.greenhouse.io/acme/jobs/99", status: "native" as const,
    questions: [{ label: "First Name", required: true, kind: "text" as const }],
    checkedAt: new Date(),
  };

  const emailOk = await evaluateProvenChannelEligibility(
    { url: "https://jobs.ashbyhq.com/acme/x", company: "Acme", recruiterEmail: "talent@acme.com" },
    user,
    { env, loadForm: async () => { throw new Error("email path must not fetch Greenhouse"); } },
  );
  assert.deepEqual(emailOk, { ok: true, channel: "recruiter_email", reason: "published_employer_email" });

  const ghOk = await evaluateProvenChannelEligibility(
    { url: "https://boards.greenhouse.io/acme/jobs/99", company: "Acme" },
    user,
    { env, loadForm: async () => nativeForm },
  );
  assert.deepEqual(ghOk, { ok: true, channel: "greenhouse", reason: "greenhouse_answerable" });

  const redirected = await evaluateProvenChannelEligibility(
    { url: "https://boards.greenhouse.io/acme/jobs/99", company: "Acme" },
    user,
    { env, loadForm: async () => ({ ...nativeForm, status: "redirected" }) },
  );
  assert.equal(redirected.ok, false);
  assert.equal(redirected.reason, "greenhouse_redirected");

  const missing = await evaluateProvenChannelEligibility(
    { url: "https://boards.greenhouse.io/acme/jobs/99", company: "Acme" },
    { factContext: { facts: [] }, hasCv: true },
    { env, loadForm: async () => nativeForm },
  );
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "greenhouse_unanswerable");

  const lever = await evaluateProvenChannelEligibility(
    { url: "https://jobs.lever.co/acme/abc", company: "Acme" },
    user,
    { env, loadForm: async () => { throw new Error("non-GH must not fetch"); } },
  );
  assert.equal(lever.ok, false);
  assert.equal(lever.reason, "no_proven_channel");
  assert.equal(GREENHOUSE_FORM_FETCH_BUDGET, 12);
  console.log("PASS proven-channel eligibility (email / GH / skip)");
}

function testReplyClassificationAndReceiptSurface() {
  const monzo = classifyReply({
    fromAddress: "careers@monzo.com",
    subject: "Thanks for your email",
    bodyText: "Unfortunately we don't take any applications over email. Please apply via our careers site.",
  });
  assert.deepEqual(monzo, { kind: "redirected_to_portal", isHuman: false });
  assert.notEqual(monzo.kind, "rifiutata");

  const ooo = classifyReply({
    fromAddress: "jane@acme.com",
    subject: "Automatic reply: out of office",
    bodyText: "I am out of office.",
  });
  assert.deepEqual(ooo, { kind: "auto_reply", isHuman: false });

  const receipt = classifyReply({
    fromAddress: "no-reply@greenhouse.io",
    subject: "Thank you for applying",
    bodyText: "We have received your application. Do not reply to this email.",
  });
  assert.deepEqual(receipt, { kind: "ricevuta", isHuman: false });

  const rejection = classifyReply({
    fromAddress: "recruiter@acme.com",
    bodyText: "Unfortunately we will not be moving forward with other candidates.",
  });
  assert.equal(rejection.kind, "rifiutata");

  const confirmed = applicationDeliveryView({
    status: "success",
    submittedVia: "portal_greenhouse",
    submitConfirmation: "DETECTED_HTTP_200",
    confirmedAt: "2026-10-24T12:00:00Z",
  });
  assert.equal(confirmed.phase, "confirmed");
  assert.match(confirmed.label, /Ricevuta ATS confermata/);
  assert.equal(deliveryEvidence({
    status: "success",
    submittedVia: "portal_greenhouse",
    submitConfirmation: "UNCONFIRMED",
    confirmedAt: "2026-10-24T12:00:00Z",
  }), "confirmed_email");
  console.log("PASS portal-redirect / auto-reply never rejected; receipt surfaces confirmedAt");
}

async function testSilentKindsDoNotReject() {
  const updates: unknown[] = [];
  const tx = {
    application: {
      findUnique: async () => ({ userStatus: null, lastReplyAt: null, lastReplyKind: null, status: "success" }),
      update: async ({ data }: { data: unknown }) => { updates.push(data); return {}; },
    },
  };
  await applyReplyToApplication({ applicationId: "a1", kind: "redirected_to_portal", isHuman: false }, tx as any);
  await applyReplyToApplication({ applicationId: "a1", kind: "auto_reply", isHuman: false }, tx as any);
  await applyReplyToApplication({ applicationId: "a1", kind: "ricevuta", isHuman: false }, tx as any);
  assert.deepEqual(updates, [
    { lastReplyKind: "redirected_to_portal" },
    { lastReplyKind: "auto_reply" },
    { lastReplyKind: "ricevuta" },
  ]);
  assert.ok(updates.every((row) => row && typeof row === "object" && !("userStatus" in row) && !("replyCount" in row)));
  console.log("PASS silent kinds never increment human replies or mark rejected");
}

function testSourceGuards() {
  const cron = readFileSync("src/lib/auto-apply-cron.ts", "utf8");
  assert.match(cron, /usesProvenChannelFilter/);
  assert.match(cron, /evaluateProvenChannelEligibility/);
  assert.match(cron, /skippedUnprovenChannel/);
  const worker = readFileSync("src/lib/application-worker.ts", "utf8");
  assert.match(worker, /inboundReplyAddress\(applicationId\)/);
  assert.match(worker, /adapter\.id === "greenhouse"/);
  assert.doesNotMatch(cron, /jobs@\$\{|careers@\$\{/);
  const processing = readFileSync("src/lib/application-reply-processing.ts", "utf8");
  assert.match(processing, /recordAtsConfirmation/);
  assert.match(processing, /kind === "ricevuta"/);
  console.log("PASS source guards (cron filter, reply+ OTP, receipt confirm)");
}

async function main() {
  testModeAndAllowList();
  testGreenhouseParseAndQuestions();
  await testGreenhouseFormCache();
  await testEligibility();
  testReplyClassificationAndReceiptSurface();
  await testSilentKindsDoNotReject();
  testSourceGuards();
  console.log("proven-channels: all tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
