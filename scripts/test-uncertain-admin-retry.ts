/**
 * Admin retry-captcha must refuse an uncertain row even when
 * historicalRetriesBlocked() returns false. Fakes only — no network/DB.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { blocksUncertainAutoRetry } from "../src/lib/uncertain-submission";

function load(path: string, mocks: Record<string, unknown>) {
  const js = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: Record<string, unknown> = {};
  new Function("require", "exports", js)((name: string) => {
    if (!(name in mocks)) throw new Error(`unexpected dependency ${name}`);
    return mocks[name];
  }, exports);
  return exports as { POST: (req: unknown) => Promise<{ status: number; body: Record<string, unknown> }> };
}

const uncertain = {
  id: "uncertain-1",
  submitStartedAt: null,
  submittedAt: null,
  submittedVia: null,
  submitConfirmation: "UNCONFIRMED",
  canaryLog: null,
  answersUsedJson: null,
  viewedAt: null,
  lastReplyAt: null,
  replyCount: 0,
  userStatus: null,
  job: { url: "https://boards.greenhouse.io/acme/jobs/1" },
};

assert.equal(blocksUncertainAutoRetry(uncertain), true);
assert.equal(blocksUncertainAutoRetry({ ...uncertain, submitConfirmation: null }), false);

async function main() {
  const enqueued: string[] = [];
  const cancelled: string[] = [];
  let historicalCalls = 0;
  const route = load("src/app/api/admin/retry-captcha/route.ts", {
    "@/lib/application-rollout": {
      historicalRetriesBlocked: () => {
        historicalCalls++;
        return false;
      },
    },
    "@/lib/application-pause": { applicationsPaused: () => false },
    "next/server": { NextResponse: { json: (body: unknown, options?: { status?: number }) => ({ status: options?.status ?? 200, body }) } },
    "@/lib/db": {
      prisma: {
        application: {
          findMany: async () => [uncertain],
          update: async () => { throw new Error("uncertain row must not be rewritten"); },
        },
      },
    },
    "@/lib/application-queue": {
      enqueueApplication: async (id: string) => { enqueued.push(id); },
      cancelApplication: async (id: string) => { cancelled.push(id); },
    },
    "@/lib/session": { getCurrentUser: async () => ({ email: "admin@example.test" }) },
    "@/lib/admin": { isAdmin: () => true },
    "@/lib/portal-adapters": { findPortalAdapter: () => ({ id: "greenhouse" }) },
    "@/lib/uncertain-submission": { blocksUncertainAutoRetry },
  });

  const res = await route.POST({
    headers: { get: () => "admin-key" },
    json: async () => ({ days: 7, limit: 10 }),
  });
  assert.equal(historicalCalls > 0, true, "route must consult historicalRetriesBlocked");
  assert.equal(res.status, 200);
  assert.equal(res.body.requeued, 0, "uncertain row must not be requeued");
  assert.equal(res.body.withAdapter, 0, "uncertain row is filtered before adapter retry");
  assert.deepEqual(enqueued, []);
  assert.deepEqual(cancelled, []);
  console.log("PASS uncertain admin retry: retry-captcha refuses UNCONFIRMED even when historicalRetriesBlocked is false");
}

main().catch((error) => { console.error(error); process.exit(1); });
