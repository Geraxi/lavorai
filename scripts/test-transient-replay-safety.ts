/** Synthetic-only regression: no browser launch, network, DB or applications. */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import type { Page } from "playwright";
import { probePortalForm } from "../src/lib/portal-adapters/form-probe";
import { observeSubmission } from "../src/lib/portal-adapters/submission-proof";
import { attemptEvidenceWrite } from "../src/lib/portal-adapters/submission-attempt-evidence";
import { notSubmitted } from "../src/lib/proof-of-send";

// Never let screenshot evidence reach external storage in this fixture.
delete process.env.BLOB_READ_WRITE_TOKEN;
const CLOSED = "Target page, context or browser has been closed";
let passed = 0;
async function test(name: string, fn: () => unknown | Promise<unknown>) {
  await fn(); passed++; console.log(`  ok ${name}`);
}

async function testProbeFailures() {
  for (const [provider, jobUrl, nameField] of [
    ["lever", "https://jobs.lever.co/example/job-123", "name"],
    ["personio", "https://example.jobs.personio.com/job/123", "first_name"],
  ]) {
    for (const status of [0, 401, 403, 408, 425, 429, 500, 502, 503, 504]) {
      await test(`${provider}: HTTP ${status} is unknown, never a missing form`, async () => {
        const result = await probePortalForm(provider, jobUrl, async (url) => ({ ok: false, status, finalUrl: url, body: "" }));
        assert.equal(result.status, "unknown");
        assert.match(result.detail, /probe_unavailable/);
      });
    }
    await test(`${provider}: thrown timeout/network error is unknown`, async () => {
      for (const error of [new DOMException("Timed out", "TimeoutError"), new TypeError("fetch failed")]) {
        assert.equal((await probePortalForm(provider, jobUrl, async () => { throw error; })).status, "unknown");
      }
    });
    await test(`${provider}: unavailable apply URL plus healthy job page is still unknown`, async () => {
      let request = 0;
      const result = await probePortalForm(provider, jobUrl, async (url) => ({
        ok: request++ > 0, status: request === 1 ? 503 : 200, finalUrl: url, body: "<html>Job description only</html>",
      }));
      assert.equal(result.status, "unknown");
    });
    await test(`${provider}: unavailable apply URL plus fallback redirect remains unknown`, async () => {
      let request = 0;
      const result = await probePortalForm(provider, jobUrl, async (url) => ({
        ok: request++ > 0, status: request === 1 ? 429 : 200,
        finalUrl: request === 1 ? url : "https://example.invalid/careers", body: "<html>Company careers</html>",
      }));
      assert.equal(result.status, "unknown");
    });
    await test(`${provider}: failure followed by a confirmed form is present`, async () => {
      let request = 0;
      const result = await probePortalForm(provider, jobUrl, async (url) => ({
        ok: request++ > 0, status: request === 1 ? 429 : 200, finalUrl: url,
        body: `<form><input name="${nameField}"><input name="email"></form>`,
      }));
      assert.equal(result.status, "present");
    });
    await test(`${provider}: definitive absent responses remain missing`, async () => {
      for (const status of [200, 404, 410]) {
        const result = await probePortalForm(provider, jobUrl, async (url) => ({ ok: status === 200, status, finalUrl: url, body: "<html>No form</html>" }));
        assert.equal(result.status, "missing");
      }
    });
  }
  await test("Greenhouse: injected transport errors also stay unknown", async () => {
    assert.equal((await probePortalForm("greenhouse", "https://boards.greenhouse.io/example/jobs/123", async () => { throw Error("Timeout"); })).status, "unknown");
  });
}

class ClosingPage extends EventEmitter {
  closed = false;
  clicks = 0;
  url() { return "https://jobs.lever.co/example/job-123/apply"; }
  async evaluate() {
    if (this.closed) throw Error(CLOSED);
    return { receiptText: "", formVisible: true, readable: true };
  }
  async waitForLoadState() { if (this.closed) throw Error(CLOSED); }
  async waitForTimeout() { if (this.closed) throw Error(CLOSED); }
  locator() {
    const locator = {
      first: () => locator, nth: () => locator,
      count: async () => { if (this.closed) throw Error(CLOSED); return 0; },
      isVisible: async () => { if (this.closed) throw Error(CLOSED); return false; },
      innerText: async () => { if (this.closed) throw Error(CLOSED); return ""; },
    };
    return locator;
  }
  async click(outbound: boolean, responseStatus?: number, bodyUnavailable = false) {
    this.clicks++;
    if (outbound) {
      const request = { url: () => this.url(), method: () => "POST", postData: () => "name=Synthetic&email=test%40example.invalid" };
      this.emit("request", request);
      if (responseStatus) this.emit("response", {
        request: () => request, url: () => this.url(), status: () => responseStatus,
        text: async () => { if (bodyUnavailable) throw Error(CLOSED); return '{"success":true,"applicationId":"synthetic-receipt"}'; },
      });
    }
    this.closed = true;
    throw Error(CLOSED);
  }
  asPage() { return this as unknown as Page; }
}

async function testClosedBrowserEvidence() {
  for (const scenario of [
    { name: "no observable POST", outbound: false },
    { name: "POST without response", outbound: true },
    { name: "POST with ambiguous 503", outbound: true, status: 503 },
    { name: "POST with unreadable response body", outbound: true, status: 200, bodyUnavailable: true },
  ]) {
    await test(`browser closes after dispatch: ${scenario.name} retains uncertainty`, async () => {
      const page = new ClosingPage();
      const { outcome } = await observeSubmission(page.asPage(), "lever", page.url(),
        () => page.click(scenario.outbound, scenario.status, scenario.bodyUnavailable));
      assert.equal(outcome.ok, false);
      assert.equal(outcome.status, "submission_unconfirmed");
      assert.equal(outcome.attemptEvidence?.clickPerformed, true);
      assert.ok(outcome.attemptEvidence?.clickPerformedAt);
      assert.equal(!!outcome.attemptEvidence?.outboundRequest, scenario.outbound);
      if (scenario.outbound) assert.equal(outcome.attemptEvidence?.destinationResponse?.ambiguous, true);
      assert.equal(page.clicks, 1);
      assert.equal(page.listenerCount("request"), 0);
      assert.equal(page.listenerCount("response"), 0);
    });
  }
  await test("synchronous click exception still preserves dispatch uncertainty", async () => {
    const page = new ClosingPage();
    const { outcome } = await observeSubmission(page.asPage(), "lever", page.url(), () => { throw Error(CLOSED); });
    assert.equal(outcome.status, "submission_unconfirmed");
    assert.equal(outcome.attemptEvidence?.clickPerformed, true);
    assert.equal(page.listenerCount("request"), 0);
    assert.equal(page.listenerCount("response"), 0);
  });
  await test("browser closure cannot discard an already captured acceptance", async () => {
    const page = new ClosingPage();
    const { outcome } = await observeSubmission(page.asPage(), "lever", page.url(), () => page.click(true, 201));
    assert.equal(outcome.ok, true);
    assert.equal(outcome.ok && outcome.receipt?.receiptId, "synthetic-receipt");
    assert.equal(outcome.attemptEvidence?.clickPerformed, true);
    assert.equal(page.clicks, 1);
  });
  await test("browser closure after explicit rejection retains rejection evidence", async () => {
    const page = new ClosingPage();
    const { outcome } = await observeSubmission(page.asPage(), "lever", page.url(), () => page.click(true, 422));
    assert.equal(outcome.status, "validation_failed");
    assert.equal(outcome.attemptEvidence?.destinationResponse?.rejected, true);
  });
  await test("blocked final gate never dispatches or fabricates click evidence", async () => {
    const page = new ClosingPage();
    const { outcome } = await observeSubmission(page.asPage(), "lever", page.url(), () => page.click(true), async () => false);
    assert.equal(outcome.attemptEvidence?.clickPerformed, false);
    assert.equal(outcome.attemptEvidence?.outboundRequest, null);
    assert.equal(page.clicks, 0);
    assert.equal(page.listenerCount("request"), 0);
    assert.equal(page.listenerCount("response"), 0);
  });
}

async function testWorkerDoesNotReplay() {
  // Execute the real worker's failed-adapter outcome branch with in-memory DB
  // writes. This catches the previous evidence-free browser-close requeue.
  const source = readFileSync("src/lib/application-worker.ts", "utf8");
  const start = source.indexOf('    if (outcome.status !== "submission_unconfirmed"');
  const end = source.indexOf('    if (["needs_user_input", "form_not_found", "job_closed"].includes(outcome.status))', start);
  assert.ok(start > 0 && end > start, "Locate the production failure branch");
  const output = ts.transpileModule(`async function handle(outcome: any) { ${source.slice(start, end)} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const attemptEvidence of [undefined, {
    version: 1 as const, clickPerformed: false, outboundRequest: null, destinationResponse: null,
  }, {
    version: 1 as const, clickPerformed: true, clickPerformedAt: new Date().toISOString(),
    outboundRequest: null, destinationResponse: null,
  }]) {
    await test(`worker holds browser-close unknown_error with ${attemptEvidence ? attemptEvidence.clickPerformed ? "click" : "empty" : "missing"} evidence`, async () => {
      const writes: any[] = [];
      const started = new Date();
      const row: any = { status: "applying", submitConfirmation: "SUBMISSION_STARTED", submitStartedAt: started };
      const ctx = vm.createContext({
        Date, JSON, console, applicationId: "synthetic-app", workToken: started, atsTestAuth: undefined,
        NOT_SUBMITTED: "NOT_SUBMITTED", REJECTED_NOT_SENT: "REJECTED_NOT_SENT",
        ATS_TEST_REFUSED_BEFORE_SUBMIT: "ATS_TEST_REFUSED_BEFORE_SUBMIT",
        liveLeaseFields: () => ({ leaseToken: "fixture-lease" }), notSubmitted, attemptEvidenceWrite,
        prisma: { application: { updateMany: async (write: any) => { writes.push(write); Object.assign(row, write.data); return { count: 1 }; } } },
      });
      vm.runInContext(output, ctx);
      await ctx.handle({ ok: false, status: "unknown_error", error: CLOSED, attemptEvidence });
      assert.equal(writes.length, 1);
      assert.equal(row.status, "ready_to_apply");
      assert.equal(row.submitConfirmation, "UNCONFIRMED");
      assert.equal(row.submitStartedAt, started, "Never clear the durable submission boundary");
      assert.equal(writes[0].where.leaseToken, "fixture-lease", "Only the owning worker may persist the hold");
      assert.equal(Object.hasOwn(writes[0].data, "startedAt"), false);
      if (attemptEvidence?.clickPerformed) assert.ok(row.submitClickPerformedAt);
    });
  }
}

async function main() {
  await testProbeFailures();
  await testClosedBrowserEvidence();
  await testWorkerDoesNotReplay();
  console.log(`PASS transient/replay safety: ${passed} synthetic checks; zero network/DB/employer submissions`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
