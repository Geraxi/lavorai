import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { greenhouseAdapter } from "../src/lib/portal-adapters/greenhouse";
import { EMPTY_PROFILE } from "../src/lib/cv-profile-types";
import { questionFingerprint } from "../src/lib/application-question-answers";
import type { ApplyInput, PendingQuestion } from "../src/lib/portal-adapters/types";

async function main() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Node provider/network calls forbidden in this browser fixture"); };
  const dir = await mkdtemp(join(tmpdir(), "greenhouse-preflight-"));
  const cv = join(dir, "fixture.docx"); await writeFile(cv, "Synthetic local fixture only");
  const browser = await chromium.launch(process.platform === "darwin" ? { channel: "chrome", headless: true } : { headless: true });
  try {
    let mutations: string[] = [], paused: PendingQuestion[] = [], dataAllowed = false, allowData = true, addedQuestion = false;
    const context = await browser.newContext({ serviceWorkers: "block" });
    await context.route("**/*", async route => {
      const request = route.request();
      if (request.method() !== "GET") { mutations.push(request.url()); return route.abort(); }
      if (!request.isNavigationRequest()) return route.abort();
      await route.fulfill({ contentType: "text/html", body: `<form>
        <label for="first_name">First Name</label><input required id="first_name" name="first_name">
        <label for="last_name">Last Name</label><input required id="last_name" name="last_name">
        <label for="email">Email</label><input required type="email" id="email" name="email">
        <label for="resume">Resume</label><input type="file" id="resume" name="resume"><span>fixture.docx</span>
        <label for="sponsor">Do you require sponsorship in the UK?</label><select required id="sponsor"><option value="">Select</option><option selected>Yes</option><option>No</option></select>
        <label for="agreement">I agree to this employer's terms</label><input required type="checkbox" id="agreement" checked>
        <button type="submit">Submit application</button></form><script>
        window.edits = []; window.allowed = false;
        document.querySelector('form').addEventListener('input', event => { window.edits.push({ name: event.target.id, allowed: window.allowed }); fetch('https://mock-employer.invalid/autosave', {method:'POST',body:event.target.value}).catch(()=>{}); });
        document.querySelector('#resume').addEventListener('change', () => { window.edits.push({ name:'upload', allowed: window.allowed }); ${addedQuestion ? "const label=document.createElement('label');label.htmlFor='extra';label.textContent='Are you a public official?';const input=document.createElement('input');input.id='extra';input.required=true;document.querySelector('form').append(label,input);" : ""} });
        document.querySelector('form').onsubmit = event => { event.preventDefault(); throw new Error('Unexpected submit'); };
      </script>` });
    });
    const page = await context.newPage();
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    const input: ApplyInput = {
      profile: { ...EMPTY_PROFILE, firstName: "Alex", lastName: "Example", email: "alex@example.invalid" },
      userEmail: "alex@example.invalid", cvLocalPath: cv, clLocalPath: cv, coverLetterText: "Synthetic", jobUrl: "https://boards.greenhouse.io/fixture/jobs/123", dryRun: false,
      onPreTransmissionPause: async questions => { assert.equal(dataAllowed, false); paused = questions; return true; },
      beforeCandidateData: async () => { dataAllowed = allowData; if (allowData) await page.evaluate(() => { (window as any).allowed = true; }); return allowData; },
      beforeSubmit: async () => false,
    };
    const first = await greenhouseAdapter.apply(page, input);
    assert.equal(first.status, "needs_user_input"); assert.equal(paused.length, 2, "Employer defaults cannot supply sponsorship or consent");
    assert.equal(paused[0].kind, "select"); assert.deepEqual(paused[0].options, ["Yes", "No"]);
    assert.deepEqual(await page.evaluate(() => (window as any).edits), []); assert.deepEqual(mutations, []);
    input.storedAnswers = paused.map(value => {
      const question = { ...value, options: value.options ?? [] };
      return { ...question, answer: question.kind === "checkbox" ? "Yes" : "No", fingerprint: questionFingerprint(question) };
    });
    allowData = false;
    const denied = await greenhouseAdapter.apply(page, input);
    assert.equal(denied.status, "submission_unconfirmed"); assert.deepEqual(await page.evaluate(() => (window as any).edits), []); assert.deepEqual(mutations, []);
    allowData = true;
    const resumed = await greenhouseAdapter.apply(page, input);
    assert.equal(resumed.status, "submission_unconfirmed", "Mock final gate denies actual submission");
    const edits = await page.evaluate(() => (window as any).edits);
    assert.ok(edits.some((e: any) => e.name === "upload")); assert.ok(edits.every((e: any) => e.allowed));
    assert.equal(await page.locator("#sponsor").inputValue(), "No");
    dataAllowed = false; paused = []; mutations = []; addedQuestion = true;
    const late = await greenhouseAdapter.apply(page, input);
    assert.equal(late.status, "needs_user_input"); assert.equal(paused.length, 0, "Conditional post-upload questions cannot attest a safe pause");
    assert.equal(dataAllowed, true); assert.deepEqual(errors, []);
    console.log("PASS actual Greenhouse + browser: exact blank-form question scope; zero candidate edits/uploads/autosave on pause or denied gate; explicit answers on resume; all edits after boundary; no proof for post-upload questions; all external traffic intercepted.");
  } finally { globalThis.fetch = originalFetch; await browser.close(); await rm(dir, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
