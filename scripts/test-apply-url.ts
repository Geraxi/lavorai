import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { publicApplyUrls } from "../src/lib/portal-adapters/apply-url";
import { preferredApplyUrl, probePortalForm } from "../src/lib/portal-adapters/form-probe";

async function main() {
  const cases = [
    ["personio", "https://acme.jobs.personio.com/job/123?language=en#apply", "https://acme.jobs.personio.com/job/123/apply?language=en"],
    ["personio", "https://acme.jobs.personio.de/job/123/?language=de&display=en", "https://acme.jobs.personio.de/job/123/apply?language=de&display=en"],
    ["personio", "https://acme.jobs.personio.com/job/123/apply/?language=en#form", "https://acme.jobs.personio.com/job/123/apply?language=en"],
    ["lever", "https://jobs.lever.co/acme/abc?lever-source=LinkedIn", "https://jobs.lever.co/acme/abc/apply?lever-source=LinkedIn"],
    ["lever", "https://jobs.eu.lever.co/acme/abc/apply?ref=one%20two&x=1#apply", "https://jobs.eu.lever.co/acme/abc/apply?ref=one%20two&x=1"],
    ["lever", "https://jobs.lever.co/acme/abc/", "https://jobs.lever.co/acme/abc/apply"],
    ["lever", "https://jobs.lever.co/acme/abc/APPLY/", "https://jobs.lever.co/acme/abc/apply"],
  ];
  for (const [provider, input, expected] of cases) {
    const [apply, posting] = publicApplyUrls(input);
    assert.equal(apply, expected);
    assert.equal(preferredApplyUrl(provider, input, ""), expected);
    assert.equal(publicApplyUrls(apply)[0], expected, "apply URL construction is idempotent");
    assert.equal(new URL(posting).search, new URL(input).search);
    assert.equal(new URL(posting).hash, "");
    assert.doesNotMatch(new URL(posting).pathname, /\/apply\/?$/i);
    const calls: string[] = [];
    const result = await probePortalForm(provider, input, async (url) => {
      calls.push(url);
      assert.equal(url, expected, "probe's first request must be the canonical apply path");
      return { ok: true, status: 200, finalUrl: url, body: provider === "lever"
        ? '<input name="name"/><input name="email"/>'
        : '<input name="first_name"/><input name="email"/>' };
    });
    assert.equal(result.status, "present");
    assert.equal(preferredApplyUrl(provider, input, result.detail), expected);
    assert.equal(calls.length, 1);
  }

  for (const provider of ["lever", "personio"]) {
    const input = provider === "lever"
      ? "https://jobs.lever.co/acme/abc/apply?source=abc#form"
      : "https://acme.jobs.personio.com/job/123/apply?language=en#form";
    const [apply, posting] = publicApplyUrls(input);
    const calls: string[] = [];
    await probePortalForm(provider, input, async (url) => {
      calls.push(url);
      return { ok: true, status: 200, finalUrl: url, body: "<html/>" };
    });
    assert.deepEqual(calls, provider === "lever" ? [apply, posting] : [apply, `${posting}#apply`, posting]);
  }
  assert.deepEqual(publicApplyUrls("not a URL"), ["not a URL", "not a URL"]);

  // Combined regression: preserving the query must not reintroduce a false
  // "missing" result when /apply is unavailable but the posting page is up.
  for (const [provider, input] of [
    ["lever", "https://jobs.lever.co/acme/abc?lever-source=LinkedIn#apply"],
    ["personio", "https://acme.jobs.personio.com/job/123?language=en#apply"],
  ]) {
    const [apply, posting] = publicApplyUrls(input);
    const seen: string[] = [];
    const result = await probePortalForm(provider, input, async (url) => {
      seen.push(url);
      return url === apply
        ? { ok: false, status: 503, finalUrl: url, body: "" }
        : { ok: true, status: 200, finalUrl: url, body: "<html>Posting without a form</html>" };
    });
    assert.equal(result.status, "unknown");
    assert.equal(seen[0], apply);
    assert.ok(seen.includes(posting));
    assert.ok(seen.every(url => new URL(url).search === new URL(input).search));
  }
  const lever = readFileSync(new URL("../src/lib/portal-adapters/lever.ts", import.meta.url), "utf8");
  assert.match(lever, /const candidates = publicApplyUrls\(input\.jobUrl\)/,
    "browser adapter and HTTP probe must share URL construction");
  const personio = readFileSync(new URL("../src/lib/portal-adapters/personio.ts", import.meta.url), "utf8");
  assert.match(personio, /preferredApplyUrl\("personio", jobUrl, ""\)/);
  console.log("PASS apply URLs: query/hash preservation, /apply idempotence, posting fallbacks and shared adapter builders (mock HTTP only)");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
