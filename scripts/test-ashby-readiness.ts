import assert from "node:assert/strict";
import { ashbyAdapter } from "../src/lib/portal-adapters/ashby";
import type { ApplyInput } from "../src/lib/portal-adapters/types";
import type { Page } from "playwright";

// Synthetic Playwright surface. Stop at upload boundary; never navigate/network.
async function fixture(failFill: boolean) {
  let uploaded = 0;
  let clicked = 0;
  const values = new Map<string, string>();
  const locator = (selector: string): any => ({
    first() { return this; },
    count: async () => selector.includes('button:') ? 0 : 1,
    waitFor: async () => {},
    fill: async (value: string) => { if (failFill) throw new Error("fixture name fill failed"); values.set(selector, value); },
    inputValue: async () => values.get(selector) ?? (selector.includes('type="email"') ? "test@example.invalid" : ""),
    setInputFiles: async () => { uploaded++; throw new Error("upload forbidden in fixture"); },
    click: async () => { clicked++; throw new Error("submit forbidden"); },
  });
  const page = { goto: async () => {}, url: () => "https://jobs.ashbyhq.com/example/job/application",
    locator, waitForTimeout: async () => {}, evaluate: async () => false } as unknown as Page;
  const outcome = await ashbyAdapter.apply(page, { profile: { firstName: "Test", lastName: "Person", email: "test@example.invalid", links: [] },
    jobUrl: "https://jobs.ashbyhq.com/example/job", userEmail: "test@example.invalid", cvLocalPath: "/never-upload", dryRun: false,
  } as unknown as ApplyInput);
  assert.equal(outcome.ok, false);
  assert.equal(clicked, 0);
  if (failFill) {
    assert.equal(uploaded, 0, "essential fill failure must stop before CV upload");
    assert.match(!outcome.ok ? outcome.error : "", /fill failed/);
  } else {
    assert.ok([...values.keys()].some(key => key.includes('input[aria-label="Name" i]')), "plain Name supported");
    assert.equal([...values.values()].includes("Test Person"), true);
    assert.ok(uploaded > 0, "valid identity reaches CV boundary, fixture blocks it");
  }
}
async function main() {
  await fixture(true);
  await fixture(false);
  console.log("PASS Ashby plain Name readiness and essential-fill failure before upload; no submit");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
