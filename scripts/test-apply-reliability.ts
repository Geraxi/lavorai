/**
 * Apply-reliability: standardised outcomes, pre-submit verify, safety stops,
 * stuck detection, dry-run. No Playwright launch, no network, no real
 * applications / messages / payments. Independently specified — no third-party
 * apply-bot source is imported.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  confirmationForFailureStatus,
  deriveAttemptOutcome,
  persistAttemptConfirmation,
  STANDARD_ATTEMPT_OUTCOMES,
} from "../src/lib/attempt-outcome";
import { pageSafetyStop, isContractorMarketplace, isIdpLoginUrl, denyUnsafePermissions, isUnsafePermissionName } from "../src/lib/portal-adapters/safety-stops";
import { verifyFilledFields, expectedFieldsFrom } from "../src/lib/portal-adapters/pre-submit-verify";
import { PageProgressTracker, isClosedPostingBanner, isClosedPostingUrl, canonicalPageUrl } from "../src/lib/portal-adapters/stuck-page";
import { inspectLivePage, abortIfFieldsWrong } from "../src/lib/portal-adapters/page-guards";
import { deriveApplicationLifecycle } from "../src/lib/application-lifecycle";

let passed = 0;
async function test(name: string, fn: () => unknown | Promise<unknown>) {
  await fn();
  passed++;
  console.log(`  ok ${name}`);
}

function mockPage(opts: {
  url?: string;
  body?: string;
  form?: string;
  dialog?: string;
  heading?: string;
  alert?: string;
  title?: string;
  fields?: Record<string, string>;
  clicks?: string[];
}) {
  const fields = { ...(opts.fields ?? {}) };
  const clicks = opts.clicks ?? [];
  const resolve = (sel: string) => {
    if (/dialog|alertdialog|aria-modal/i.test(sel)) {
      return opts.dialog != null ? { kind: "text" as const, value: opts.dialog } : null;
    }
    if (/role=['"]form['"]|^form\b|form,/.test(sel)) {
      return opts.form != null ? { kind: "text" as const, value: opts.form } : null;
    }
    if (sel === "h1" || /^h1\b/.test(sel)) {
      return opts.heading != null ? { kind: "text" as const, value: opts.heading } : null;
    }
    if (/role=['"]alert['"]/.test(sel)) {
      return opts.alert != null ? { kind: "text" as const, value: opts.alert } : null;
    }
    if (sel === "body") return { kind: "text" as const, value: opts.body ?? "" };
    const key = /email/i.test(sel) ? "email"
      : /first|given-name/i.test(sel) ? "firstName"
      : /last|family-name/i.test(sel) ? "lastName"
      : /phone|tel/i.test(sel) ? "phone"
      : /city|address-level2/i.test(sel) ? "city"
      : /authoriz|workAuth|visa/i.test(sel) ? "workAuth"
      : null;
    if (!key || !(key in fields)) return null;
    return { kind: "input" as const, key, value: fields[key] };
  };
  const locator = (sel: string) => {
    const hit = resolve(sel);
    const el = {
      count: async () => (hit ? 1 : 0),
      isVisible: async () => !!hit,
      innerText: async () => (hit?.kind === "text" ? hit.value : hit?.kind === "input" ? "" : ""),
      inputValue: async () => (hit?.kind === "input" ? fields[hit.key] : ""),
      fill: async (v: string) => {
        if (hit?.kind === "input") fields[hit.key] = v;
      },
      click: async () => { clicks.push(sel); },
      first: () => el,
    };
    return el;
  };
  return {
    url: () => opts.url ?? "https://boards.greenhouse.io/acme/jobs/1",
    title: async () => opts.title ?? "",
    locator,
    clicks,
    fields,
  } as unknown as import("playwright").Page & { clicks: string[]; fields: Record<string, string> };
}

const TRIGGER_JD = [
  "We use SSO and SAML for internal tools. Identity verification and a government ID",
  "may be required after offer. Candidates who are not eligible for visa sponsorship",
  "or whose work authorisation has expired should not apply. Sign in with Google",
  "Workspace experience is a plus. Please log in to the corporate VPN to start.",
].join(" ");

const profile = {
  firstName: "Ada", lastName: "Lovelace", email: "ada@example.test",
  phone: "+39 333 1234567", city: "Milano",
};

async function main() {
  console.log("apply-reliability");

  await test("standard outcomes are exactly the declared set", () => {
    assert.deepEqual([...STANDARD_ATTEMPT_OUTCOMES], [
      "APPLIED", "EXPIRED", "CAPTCHA", "LOGIN_REQUIRED", "NOT_ELIGIBLE", "NEEDS_ANSWERS",
    ]);
  });

  await test("APPLIED is never written; it is derived from confirmation", () => {
    assert.throws(() => persistAttemptConfirmation("APPLIED"), /never written directly/);
    assert.equal(persistAttemptConfirmation("EXPIRED"), "EXPIRED");
    assert.equal(persistAttemptConfirmation("FAILED:stuck"), "FAILED:stuck");
    assert.equal(deriveAttemptOutcome({
      status: "success", submitConfirmation: "DETECTED_HTTP_2xx",
    }), null, "DETECTED without a stored receipt is not APPLIED");
    assert.equal(deriveAttemptOutcome({
      status: "success", submitConfirmation: "EMAIL_SENT",
    }), null, "EMAIL_SENT without a stored receipt is not APPLIED");
    assert.equal(deriveAttemptOutcome({
      status: "success", submitConfirmation: "MAILBOX_NO_BOUNCE",
    }), null, "mailbox no-bounce is not confirmed acceptance");
    assert.equal(deriveAttemptOutcome({
      status: "success", submitConfirmation: null,
    }), null);
    assert.equal(deriveAttemptOutcome({
      status: "ready_to_apply", submitConfirmation: "UNCONFIRMED",
    }), null, "unconfirmed click is not APPLIED");
    assert.equal(deriveAttemptOutcome({
      status: "ready_to_apply", submitConfirmation: "DRY_RUN",
    }), null);
  });

  await test("every adapter failure maps to exactly one stored outcome", () => {
    assert.equal(confirmationForFailureStatus("login_required"), "LOGIN_REQUIRED");
    assert.equal(confirmationForFailureStatus("not_eligible"), "NOT_ELIGIBLE");
    assert.equal(confirmationForFailureStatus("job_closed"), "EXPIRED");
    assert.equal(confirmationForFailureStatus("needs_user_input"), "NEEDS_ANSWERS");
    assert.equal(confirmationForFailureStatus("captcha"), "CAPTCHA");
    assert.equal(confirmationForFailureStatus("stuck"), "FAILED:stuck");
    assert.equal(confirmationForFailureStatus("unsafe_permissions"), "FAILED:unsafe_permissions");
    assert.equal(confirmationForFailureStatus("sso_required"), "FAILED:sso_required");
    assert.equal(confirmationForFailureStatus("marketplace"), "FAILED:marketplace");
    assert.equal(confirmationForFailureStatus("id_verification"), "FAILED:id_verification");
    assert.equal(confirmationForFailureStatus("not_a_job_application"), "FAILED:not_a_job_application");
    assert.equal(deriveAttemptOutcome({ status: "failed", submitConfirmation: "EXPIRED" }), "EXPIRED");
    assert.equal(deriveAttemptOutcome({ status: "needs_answers", submitConfirmation: "NEEDS_ANSWERS" }), "NEEDS_ANSWERS");
    assert.equal(deriveAttemptOutcome({ status: "failed", submitConfirmation: "FAILED:stuck" }), "FAILED:stuck");
  });

  await test("user-facing lifecycle surfaces the standardised outcome", () => {
    const base = {
      status: "failed", submittedVia: null, submitConfirmation: "FAILED:marketplace",
      submissionReceiptJson: null, errorMessage: "Contractor marketplace.",
      consentGrantedAt: null, startedAt: null, completedAt: new Date(), submittedAt: null,
      createdAt: new Date(), retryCount: 0, cvPdfPath: null, cvDocxPath: null, coverLetterPath: null,
      job: { url: "https://mercor.com/jobs/1", source: "web" }, emailAttempts: [],
    };
    const view = deriveApplicationLifecycle(base);
    assert.equal(view.attemptOutcome, "FAILED:marketplace");
    assert.equal(view.status, "failed");
    assert.match(view.message.en, /marketplace|Stopped/i);
    const applied = deriveApplicationLifecycle({
      ...base, status: "success", submittedVia: "portal_greenhouse",
      submitConfirmation: "DETECTED_HTTP_2xx",
      submissionReceiptJson: JSON.stringify({
        version: 1, provider: "greenhouse", kind: "http", capturedAt: new Date().toISOString(),
        jobId: "1", endpoint: "https://boards-api.greenhouse.io/v1/boards/acme/jobs/1",
        operation: "application.create", httpStatus: 201, signal: "application_id", receiptId: "9",
      }),
      submittedAt: new Date(),
    });
    assert.equal(applied.attemptOutcome, "APPLIED");
    assert.equal(applied.status, "confirmed_submitted");
  });

  await test("safety stops: marketplace, SSO via IdP URL, form/dialog prompts", () => {
    const gh = "https://boards.greenhouse.io/acme/jobs/1";
    assert.equal(isContractorMarketplace("https://jobs.mercor.com/x"), true);
    assert.equal(isContractorMarketplace("https://www.toptal.com/apply"), true);
    assert.equal(isContractorMarketplace("https://upwork.com/jobs/1"), true);
    assert.equal(isContractorMarketplace(gh), false);
    assert.equal(pageSafetyStop({ url: "https://mercor.com/j/1" })?.outcome, "FAILED:marketplace");
    assert.equal(isIdpLoginUrl("https://accounts.google.com/o/oauth2/v2/auth?client_id=x"), true);
    assert.equal(isIdpLoginUrl("https://acme.okta.com/app/greenhouse/sso/saml"), true);
    assert.equal(isIdpLoginUrl(gh), false);
    assert.equal(pageSafetyStop({ url: "https://accounts.google.com/o/oauth2/v2/auth" })?.outcome, "FAILED:sso_required");
    assert.equal(pageSafetyStop({ url: gh, formText: "Sign in with Google to continue" }), null, "SSO is URL-only, not form copy");
    assert.equal(pageSafetyStop({ url: gh, dialogText: "Please take a selfie" })?.outcome, "FAILED:id_verification");
    assert.equal(pageSafetyStop({ url: gh, formText: "Please log in to apply" })?.outcome, "LOGIN_REQUIRED");
    assert.equal(pageSafetyStop({ url: gh, dialogText: "You are not eligible for this location" })?.outcome, "NOT_ELIGIBLE");
    assert.equal(pageSafetyStop({ url: gh, formText: "Join our talent network" })?.outcome, "FAILED:not_a_job_application");
    assert.equal(pageSafetyStop({ url: gh, formText: "First name Email Submit application" }), null);
  });

  await test("job-description words must not trigger a safety stop or EXPIRED", async () => {
    const gh = "https://boards.greenhouse.io/acme/jobs/1";
    assert.equal(pageSafetyStop({ url: gh, formText: "First name, Email, Submit" }), null);
    assert.equal(isClosedPostingBanner(TRIGGER_JD), false, "JD 'expired' is not a closed banner");
    assert.equal(isClosedPostingUrl(gh), false);
    const live = await inspectLivePage(mockPage({
      url: gh,
      body: TRIGGER_JD,
      form: "First name\nLast name\nEmail\nSubmit application",
      heading: "Product Designer",
      title: "Product Designer — Acme",
    }) as never);
    assert.equal(live, null, "JD with SSO/SAML/identity verification/not eligible/expired must not stop");
  });

  await test("never grant camera, microphone or geolocation", async () => {
    assert.equal(isUnsafePermissionName("camera"), true);
    assert.equal(isUnsafePermissionName("microphone"), true);
    assert.equal(isUnsafePermissionName("geolocation"), true);
    assert.equal(isUnsafePermissionName("notifications"), false);
    const granted: string[] = [];
    await denyUnsafePermissions({
      grantPermissions: async (p) => { granted.push(...p); },
      clearPermissions: async () => undefined,
    });
    assert.deepEqual(granted, [], "grantPermissions must not be called");
    const browser = readFileSync(new URL("../src/lib/browser.ts", import.meta.url), "utf8");
    assert.match(browser, /permissions: \[\]/);
    assert.match(browser, /geolocation: undefined/);
    assert.match(browser, /clearPermissions/);
    assert.doesNotMatch(browser, /grantPermissions/);
  });

  await test("pre-submit verify: matching fields pass; mismatch aborts NEEDS_ANSWERS", async () => {
    const okPage = mockPage({
      fields: { email: "ada@example.test", firstName: "Ada", lastName: "Lovelace", phone: "3331234567", city: "Milano" },
    });
    const ok = await verifyFilledFields(okPage, expectedFieldsFrom({
      profile, userEmail: "ada@example.test", resumeUploaded: true,
    }));
    assert.equal(ok.ok, true);

    const bad = mockPage({
      fields: { email: "wrong@example.test", firstName: "Ada", lastName: "Lovelace" },
    });
    const mismatch = await verifyFilledFields(bad, expectedFieldsFrom({
      profile, userEmail: "ada@example.test", resumeUploaded: true,
    }));
    assert.equal(mismatch.ok, true, "one refill of email should succeed");
    assert.ok(mismatch.ok && mismatch.fixes.includes("email"));

    const locked = mockPage({
      fields: { email: "locked@example.test" },
    });
    const origFill = (locked as unknown as { locator: (s: string) => { first: () => { fill: (v: string) => Promise<void> } } }).locator;
    // refill writes but value stays locked
    const page = {
      ...locked,
      locator: (sel: string) => {
        const loc = (locked as unknown as { locator: (s: string) => Record<string, unknown> }).locator(sel);
        return {
          ...loc,
          fill: async () => undefined,
          first: () => ({ ...loc, fill: async () => undefined, inputValue: async () => "locked@example.test" }),
        };
      },
    } as unknown as import("playwright").Page;
    void origFill;
    const fail = await verifyFilledFields(page, expectedFieldsFrom({
      profile, userEmail: "ada@example.test", resumeUploaded: true,
    }));
    assert.equal(fail.ok, false);
    assert.ok(!fail.ok && fail.missing.includes("email"));

    const noResume = await verifyFilledFields(mockPage({ fields: { email: "ada@example.test" } }), expectedFieldsFrom({
      profile, userEmail: "ada@example.test", resumeUploaded: false,
    }));
    assert.equal(noResume.ok, false);
    assert.ok(!noResume.ok && noResume.missing.includes("resume"));

    const abort = await abortIfFieldsWrong(mockPage({ fields: { email: "ada@example.test" } }) as never, {
      profile, userEmail: "ada@example.test", userPhone: "", coverLetterText: "",
      cvLocalPath: "/tmp/cv.pdf", clLocalPath: "", jobUrl: "https://boards.greenhouse.io/acme/jobs/1", dryRun: true,
    } as never, false);
    assert.equal(abort?.status, "needs_user_input");
  });

  await test("stuck: same canonical URL three times → FAILED:stuck; closed posting → EXPIRED", async () => {
    const tracker = new PageProgressTracker(3);
    assert.equal(tracker.note("https://boards.greenhouse.io/acme/jobs/1?utm_source=x"), "progress");
    assert.equal(tracker.note("https://boards.greenhouse.io/acme/jobs/1#top"), "progress");
    assert.equal(tracker.note("https://boards.greenhouse.io/acme/jobs/1?gh_src=abc"), "stuck");
    assert.equal(
      canonicalPageUrl("https://boards.greenhouse.io/acme/jobs/1?utm_source=x#z"),
      canonicalPageUrl("https://boards.greenhouse.io/acme/jobs/1?gh_src=y"),
    );
    const moving = new PageProgressTracker(3);
    moving.note("https://a.example/1");
    moving.note("https://a.example/2");
    assert.equal(moving.note("https://a.example/3"), "progress");
    assert.equal(isClosedPostingBanner("This job is no longer accepting applications"), true);
    assert.equal(isClosedPostingBanner("Annuncio scaduto"), true);
    assert.equal(isClosedPostingBanner("Apply now for this role"), false);
    assert.equal(isClosedPostingBanner("Token expired after 30 days"), false);
    assert.equal(isClosedPostingUrl("https://boards.greenhouse.io/acme/jobs/1/job-closed"), true);
    assert.equal(isClosedPostingUrl("https://boards.greenhouse.io/acme/jobs/1"), false);

    const closed = await inspectLivePage(mockPage({
      url: "https://boards.greenhouse.io/acme/jobs/1",
      heading: "This job is no longer accepting applications.",
      body: TRIGGER_JD,
    }) as never);
    assert.equal(closed?.status, "job_closed");

    const closed404 = await inspectLivePage(mockPage({
      url: "https://jobs.lever.co/acme/abcd/not-found",
      body: TRIGGER_JD,
    }) as never);
    assert.equal(closed404?.status, "job_closed");

    const stuckTracker = new PageProgressTracker(3);
    stuckTracker.note("https://boards.greenhouse.io/acme/jobs/1");
    stuckTracker.note("https://boards.greenhouse.io/acme/jobs/1");
    const stuck = await inspectLivePage(mockPage({
      url: "https://boards.greenhouse.io/acme/jobs/1",
      body: "Apply",
    }) as never, stuckTracker);
    assert.equal(stuck?.status, "stuck");
  });

  await test("dry-run fills but never clicks the final submit", () => {
    for (const file of [
      "../src/lib/portal-adapters/web-form.ts",
      "../src/lib/portal-adapters/greenhouse.ts",
      "../src/lib/portal-adapters/ashby.ts",
      "../src/lib/portal-adapters/lever.ts",
      "../src/lib/portal-adapters/workable.ts",
      "../src/lib/portal-adapters/smartrecruiters.ts",
    ]) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      const dry = src.indexOf("if (input.dryRun)");
      assert.ok(dry >= 0, file);
      const clickWindow = src.slice(dry);
      assert.match(clickWindow, /DRY_RUN/);
      // The dry-run return precedes observeSubmission / submit.click in each adapter.
      const submit = clickWindow.search(/observeSubmission|submit\.first\(\)\.click|submit\.click/);
      assert.ok(submit < 0 || clickWindow.indexOf("return") < submit, `${file} must return DRY_RUN before click`);
    }
    const admin = readFileSync(new URL("../src/app/api/admin/test-apply/route.ts", import.meta.url), "utf8");
    assert.match(admin, /dryRun !== false/);
    assert.match(admin, /forceDryRun: dryRun/);
    const worker = readFileSync(new URL("../src/lib/application-worker.ts", import.meta.url), "utf8");
    assert.match(worker, /forceDryRun === true \|\| process\.env\.PORTAL_SUBMIT_DRY_RUN === "true"/);
    assert.doesNotMatch(worker, /2captcha|anticaptcha|capsolver|captcha.?solv/i);
  });

  await test("no captcha-solving service and no ApplyPilot copy", () => {
    const files = [
      "src/lib/attempt-outcome.ts",
      "src/lib/portal-adapters/safety-stops.ts",
      "src/lib/portal-adapters/pre-submit-verify.ts",
      "src/lib/portal-adapters/stuck-page.ts",
      "src/lib/portal-adapters/page-guards.ts",
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /ApplyPilot|Pickle-Pixel|2captcha|anticaptcha|capsolver/i, file);
    }
  });

  console.log(`apply-reliability: ${passed} passed`);
}

main().catch((err) => { console.error(err); process.exit(1); });
