import assert from "node:assert/strict";
import type { Page } from "playwright";
import { submitWithSecurityCode } from "../src/lib/portal-adapters/greenhouse";
import { SECURITY_CODE_FIELD } from "../src/lib/application-security-code";

async function run(options: { missing?: boolean; challengeRemains?: boolean; fillFails?: boolean } = {}) {
  let filled = "";
  let clicks = 0;
  let polls = 0;
  const locator: any = {
    first() { return this; }, last() { return this; }, filter() { return this; },
    count: async () => 1, waitFor: async () => {},
    fill: async (value: string) => { if (options.fillFails) throw new Error("field unavailable"); filled = value; },
    click: async () => { clicks++; },
    innerText: async () => options.challengeRemains ? "Enter security code" : "Your application has been received",
  };
  const page = {
    locator: (selector: string) => selector === SECURITY_CODE_FIELD
      ? { ...locator, isVisible: async () => options.challengeRemains ?? false }
      : locator,
    waitForTimeout: async () => {}, waitForLoadState: async () => {},
    waitForResponse: async () => ({ status: () => 200 }),
    url: () => "https://boards.greenhouse.io/company/jobs/1",
  } as unknown as Page;
  const result = await submitWithSecurityCode(page, "test", new Date(), async () => {
    polls++;
    return options.missing || polls === 1 ? [] : [{ fromAddress: "no-reply@greenhouse.io", subject: "Security code for application", bodyText: "Copy and paste this code: YqOsq2bB" }];
  });
  return { result, filled, clicks, polls };
}
async function main() {
  const success = await run();
  assert.equal(success.result.ok, true);
  assert.equal(success.filled, "YqOsq2bB");
  assert.equal(success.clicks, 1);
  assert.equal(success.polls, 2);
  const missing = await run({ missing: true });
  assert.equal(missing.result.ok, false);
  assert.equal(missing.clicks, 0);
  assert.equal(missing.polls, 30);
  const rejected = await run({ challengeRemains: true });
  assert.equal(rejected.result.ok, false, "HTTP 200 with a remaining challenge must not count as sent");
  await assert.rejects(run({ fillFails: true }), /field unavailable/);
  console.log("4 automated security-code flow scenarios passed");
}
void main();
