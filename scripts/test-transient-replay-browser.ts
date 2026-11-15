/** Real Chromium against intercepted synthetic pages only. No external sends. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import serverChromium from "@sparticuz/chromium";
import { observeSubmission } from "../src/lib/portal-adapters/submission-proof";

delete process.env.BLOB_READ_WRITE_TOKEN;
const JOB = "https://jobs.lever.co/synthetic/job-123/apply";
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error("External Node fetch forbidden in this fixture"); };

async function main() {
  // Use the same bundled Linux browser as the other isolated UI fixtures and
  // production, not a distro launcher that may require unavailable OS sockets.
  const launchOptions = process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : process.platform === "linux"
      ? { executablePath: await serverChromium.executablePath(), args: serverChromium.args }
      : {};
  try {
    for (const scenario of ["no-response", "accepted", "server-error"] as const) {
      // The bundled single-process Chromium may exit after its last context
      // closes. Keep scenarios isolated instead of reusing that torn-down process.
      const browser = await chromium.launch({ headless: true, ...launchOptions });
      try {
        const context = await browser.newContext({ serviceWorkers: "block" });
        const page = await context.newPage();
        let posts = 0;
        const unexpected: string[] = [];
        await context.route("**/*", async route => {
          const request = route.request();
          if (request.url() !== JOB) { unexpected.push(request.url()); return route.abort(); }
          if (request.method() === "GET") return route.fulfill({ contentType: "text/html", body: `
            <form><input name="name" value="Synthetic"><input type="email" name="email" value="synthetic@example.invalid"><button>Submit</button></form>
            <script>document.querySelector('form').onsubmit = e => { e.preventDefault(); fetch(location.href, {method:'POST', body:new URLSearchParams(new FormData(e.target))}).catch(()=>{}); };</script>` });
          if (request.method() !== "POST") { unexpected.push(request.method()); return route.abort(); }
          posts++;
          if (scenario === "no-response") { await route.abort(); await page.close(); return; }
          await route.fulfill({ status: scenario === "accepted" ? 201 : 503, contentType: "application/json", body: '{"success":true,"applicationId":"synthetic-receipt"}' });
        });
        await page.goto(JOB);
        const observed = await observeSubmission(page, "lever", JOB, async () => {
          if (scenario === "no-response") {
            const closed = page.waitForEvent("close");
            await page.getByRole("button", { name: "Submit", exact: true }).click().catch(() => undefined);
            await closed;
            return;
          }
          const response = page.waitForResponse(r => r.url() === JOB && r.request().method() === "POST");
          await page.getByRole("button", { name: "Submit", exact: true }).click();
          await (await response).body();
          await page.close();
        });
        assert.equal(page.isClosed(), true);
        assert.equal(posts, 1, "Never dispatch a second application");
        assert.deepEqual(unexpected, []);
        assert.equal(observed.outcome.attemptEvidence?.clickPerformed, true);
        assert.ok(observed.outcome.attemptEvidence?.outboundRequest);
        if (scenario === "accepted") {
          assert.equal(observed.outcome.ok, true);
          assert.equal(observed.outcome.ok && observed.outcome.receipt?.receiptId, "synthetic-receipt");
        } else {
          assert.equal(observed.outcome.status, "submission_unconfirmed");
          assert.equal(observed.outcome.attemptEvidence?.destinationResponse?.ambiguous, true);
        }
        await context.close();
        console.log(`PASS actual Chromium ${scenario}: closed page retained evidence, exactly one intercepted POST`);
      } finally {
        await browser.close();
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
