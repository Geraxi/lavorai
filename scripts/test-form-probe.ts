/**
 * HTTP form-probe + Personio/Lever apply URL preference (no network).
 */
import assert from "node:assert/strict";
import {
  preferredApplyUrl,
  probePortalForm,
  type FormProbeResult,
} from "../src/lib/portal-adapters/form-probe";

async function main() {
  const personioJob = "https://impower.jobs.personio.com/job/2879528#apply";
  assert.equal(
    preferredApplyUrl("personio", personioJob, ""),
    "https://impower.jobs.personio.com/job/2879528/apply",
  );
  assert.equal(
    preferredApplyUrl("lever", "https://jobs.lever.co/360learning/61f6ea5c-5ef1-4890-b1b9-1eee825680f3", ""),
    "https://jobs.lever.co/360learning/61f6ea5c-5ef1-4890-b1b9-1eee825680f3/apply",
  );

  const calls: string[] = [];
  const fakeFetch = async (url: string) => {
    calls.push(url);
    if (url.endsWith("/apply") && url.includes("personio")) {
      return {
        ok: true,
        status: 200,
        finalUrl: url,
        body: '<form><input name="first_name"/><input name="email"/></form>',
      };
    }
    if (url.includes("personio")) {
      return { ok: true, status: 200, finalUrl: url, body: "<html>job page without form</html>" };
    }
    if (url.endsWith("/apply") && url.includes("lever")) {
      return {
        ok: true,
        status: 200,
        finalUrl: url,
        body: '<input name="name"/><input name="email"/><input name="resume"/>',
      };
    }
    return { ok: true, status: 200, finalUrl: url, body: "<html/>" };
  };

  const personio: FormProbeResult = await probePortalForm("personio", personioJob, fakeFetch);
  assert.equal(personio.status, "present");
  assert.match(personio.detail, /\/apply/);
  assert.ok(calls.some((u) => u.includes("/apply")), "Personio probe must try /apply");

  calls.length = 0;
  const lever = await probePortalForm(
    "lever",
    "https://jobs.lever.co/360learning/61f6ea5c-5ef1-4890-b1b9-1eee825680f3",
    fakeFetch,
  );
  assert.equal(lever.status, "present");

  const missing = await probePortalForm(
    "personio",
    "https://missing.jobs.personio.com/job/1",
    async (url) => ({ ok: true, status: 200, finalUrl: url, body: "<html>no form</html>" }),
  );
  assert.equal(missing.status, "missing");

  console.log("PASS form-probe: Personio /apply and Lever /apply detection without employer API keys");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
