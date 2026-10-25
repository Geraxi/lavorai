import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import {
  checkResendReceivingCredential,
  fetchResendReceivedEmail,
  logResendReceivingError,
  parseReceivingEmailId,
  resendReceivingApiKey,
  resendReceivingAuthorization,
  resendReceivingKeySlot,
  resendSendingApiKey,
  sanitizeResendLogText,
} from "../src/lib/resend-keys";
import { isAdmin } from "../src/lib/admin";
import { checkOrigin } from "../src/lib/csrf";
import { authorizeEmailTestRequest } from "../src/lib/email-test-capability";

const SAMPLE_ID = "11111111-1111-4111-8111-111111111111";
const LISTED_ID = "22222222-2222-4222-8222-222222222222";
const CONTENT_FIELDS = ["from", "to", "subject", "html", "text", "body", "headers", "attachments"];

function load(path: string, mocks: Record<string, unknown> = {}): any {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function("require", "exports", source)((name: string) => mocks[name] ?? {}, exports);
  return exports;
}

function assertNoContentFields(value: unknown, label: string) {
  const raw = JSON.stringify(value);
  for (const field of CONTENT_FIELDS) {
    assert.doesNotMatch(raw, new RegExp(`"${field}"\\s*:`), `${label} must not include ${field}`);
  }
  assert.doesNotMatch(raw, /re_recv|re_send|Bearer /);
  const keys = value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value as object)
    : [];
  for (const key of keys) {
    assert.ok(
      ["ok", "keySlot", "listStatus", "fetchStatus", "fetchedId", "idMatches", "receivedAt", "hasBody", "error"].includes(key),
      `${label} unexpected key ${key}`,
    );
  }
}

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".next") walk(path, files);
    else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

async function main() {
  assert.equal(resendSendingApiKey({ RESEND_API_KEY: "re_send", RESEND_RECEIVING_API_KEY: "re_recv" }), "re_send");
  assert.equal(resendReceivingApiKey({ RESEND_API_KEY: "re_send", RESEND_RECEIVING_API_KEY: "re_recv" }), "re_recv");
  assert.equal(resendReceivingKeySlot({ RESEND_API_KEY: "re_send", RESEND_RECEIVING_API_KEY: "re_recv" }), "receiving");
  assert.deepEqual(resendReceivingAuthorization({ RESEND_API_KEY: "re_send", RESEND_RECEIVING_API_KEY: "re_recv" }), {
    apiKey: "re_recv", slot: "receiving",
  });

  assert.equal(resendReceivingApiKey({ RESEND_API_KEY: "re_send" }), "re_send");
  assert.equal(resendReceivingKeySlot({ RESEND_API_KEY: "re_send" }), "fallback");
  assert.equal(resendReceivingApiKey({ RESEND_RECEIVING_API_KEY: "  " , RESEND_API_KEY: "re_send" }), "re_send");
  assert.equal(resendReceivingApiKey({}), undefined);
  assert.equal(resendReceivingKeySlot({}), null);
  assert.equal(resendSendingApiKey({ RESEND_RECEIVING_API_KEY: "re_recv" }), undefined, "sending never uses the receiving key");

  const headers: string[] = [];
  const received = await fetchResendReceivedEmail("em_1", {
    RESEND_API_KEY: "re_send",
    RESEND_RECEIVING_API_KEY: "re_recv",
  }, async (url, init) => {
    headers.push(String((init?.headers as { Authorization?: string })?.Authorization ?? ""));
    assert.equal(url, "https://api.resend.com/emails/receiving/em_1");
    return new Response(JSON.stringify({ text: "body", html: null }), { status: 200 });
  });
  assert.equal(headers[0], "Bearer re_recv");
  assert.equal(received.text, "body");

  const fallbackHeaders: string[] = [];
  await fetchResendReceivedEmail("em_2", { RESEND_API_KEY: "re_send" }, async (_url, init) => {
    fallbackHeaders.push(String((init?.headers as { Authorization?: string })?.Authorization ?? ""));
    return new Response(JSON.stringify({ text: "fallback", html: null }), { status: 200 });
  });
  assert.equal(fallbackHeaders[0], "Bearer re_send");

  await assert.rejects(
    () => fetchResendReceivedEmail("em_3", {}, async () => new Response("no", { status: 200 })),
    /inbound_body_credentials_unavailable/,
  );

  const logs: unknown[] = [];
  const previous = console.error;
  console.error = (...args: unknown[]) => { logs.push(args); };
  try {
    await assert.rejects(
      () => fetchResendReceivedEmail("em_4", {
        RESEND_API_KEY: "re_send",
        RESEND_RECEIVING_API_KEY: "re_recv",
      }, async () => new Response(JSON.stringify({
        name: "validation_error",
        statusCode: 401,
        message: "Bearer re_secret123 denied",
      }), { status: 401 })),
      /inbound_body_unavailable_401/,
    );
  } finally {
    console.error = previous;
  }
  const logged = JSON.stringify(logs);
  assert.match(logged, /"slot":"receiving"/);
  assert.match(logged, /validation_error/);
  assert.match(logged, /401/);
  assert.doesNotMatch(logged, /re_secret123|re_recv|re_send/);
  assert.equal(sanitizeResendLogText("Bearer re_secret123 denied"), "Bearer [redacted] denied");
  const fallbackLogs: unknown[] = [];
  console.error = (...args: unknown[]) => { fallbackLogs.push(args); };
  try {
    logResendReceivingError({ name: "application_error", statusCode: 500, message: "re_abcXYZ", slot: "fallback" });
  } finally {
    console.error = previous;
  }
  assert.match(JSON.stringify(fallbackLogs), /"slot":"fallback"/);
  assert.doesNotMatch(JSON.stringify(fallbackLogs), /re_abcXYZ/);

  assert.equal(parseReceivingEmailId(SAMPLE_ID), SAMPLE_ID);
  assert.equal(parseReceivingEmailId("em_not_a_uuid"), null);
  assert.equal(parseReceivingEmailId(" not-uuid "), null);

  const leakedEmail = {
    id: SAMPLE_ID,
    from: "recruiter@acme.com",
    to: ["candidate@lavorai.it"],
    subject: "Interview",
    html: "<p>secret</p>",
    text: "secret body",
    headers: { "x-secret": "1" },
    attachments: [{ filename: "cv.pdf" }],
    created_at: "2026-10-25T12:00:00.000Z",
    received_at: "2026-10-25T12:00:01.000Z",
  };

  const noFetch: string[] = [];
  const missing = await checkResendReceivingCredential({
    env: {},
    fetch: async (url) => { noFetch.push(String(url)); return new Response("no"); },
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.keySlot, "missing");
  assert.equal(noFetch.length, 0);
  assertNoContentFields(missing, "missing slot");

  const fallbackBlocked = await checkResendReceivingCredential({
    requireReceivingKey: true,
    env: { RESEND_API_KEY: "re_send" },
    fetch: async (url) => { noFetch.push(String(url)); return new Response("no"); },
  });
  assert.equal(fallbackBlocked.ok, false);
  assert.equal(fallbackBlocked.keySlot, "fallback");
  assert.equal(fallbackBlocked.error?.name, "receiving_key_required");
  assert.equal(noFetch.length, 0);
  assertNoContentFields(fallbackBlocked, "fallback required");

  const fallbackAllowedCalls: string[] = [];
  const fallbackOk = await checkResendReceivingCredential({
    id: SAMPLE_ID,
    env: { RESEND_API_KEY: "re_send" },
    fetch: async (url, init) => {
      fallbackAllowedCalls.push(String(url));
      assert.equal(String((init?.headers as { Authorization?: string })?.Authorization), "Bearer re_send");
      return new Response(JSON.stringify(leakedEmail), { status: 200 });
    },
  });
  assert.equal(fallbackOk.ok, true);
  assert.equal(fallbackOk.keySlot, "fallback");
  assert.equal(fallbackOk.listStatus, null);
  assert.equal(fallbackOk.fetchStatus, 200);
  assert.equal(fallbackOk.fetchedId, SAMPLE_ID);
  assert.equal(fallbackOk.idMatches, true);
  assert.equal(fallbackOk.hasBody, true);
  assert.equal(fallbackOk.receivedAt, "2026-10-25T12:00:01.000Z");
  assert.equal(fallbackAllowedCalls.length, 1);
  assert.match(fallbackAllowedCalls[0]!, /\/emails\/receiving\/11111111-1111-4111-8111-111111111111$/);
  assertNoContentFields(fallbackOk, "fallback fetch");

  const receivingCalls: string[] = [];
  const receivingOk = await checkResendReceivingCredential({
    requireReceivingKey: true,
    env: { RESEND_API_KEY: "re_send", RESEND_RECEIVING_API_KEY: "re_recv" },
    fetch: async (url, init) => {
      receivingCalls.push(String(url));
      assert.equal(String((init?.headers as { Authorization?: string })?.Authorization), "Bearer re_recv");
      if (String(url).includes("limit=1")) {
        return new Response(JSON.stringify({
          data: [{ id: LISTED_ID, from: "boss@acme.com", subject: "listed secret", text: "listed body" }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ ...leakedEmail, id: LISTED_ID, html: "", text: "" }), { status: 200 });
    },
  });
  assert.equal(receivingOk.ok, true);
  assert.equal(receivingOk.keySlot, "receiving");
  assert.equal(receivingOk.listStatus, 200);
  assert.equal(receivingOk.fetchStatus, 200);
  assert.equal(receivingOk.fetchedId, LISTED_ID);
  assert.equal(receivingOk.idMatches, true);
  assert.equal(receivingOk.hasBody, false);
  assert.equal(receivingCalls.length, 2);
  assert.match(receivingCalls[0]!, /\/emails\/receiving\?limit=1$/);
  assert.match(receivingCalls[1]!, /\/emails\/receiving\/22222222-2222-4222-8222-222222222222$/);
  assertNoContentFields(receivingOk, "receiving list+fetch");

  const invalidCalls: string[] = [];
  const invalid = await checkResendReceivingCredential({
    id: "em_not_uuid",
    env: { RESEND_RECEIVING_API_KEY: "re_recv" },
    fetch: async (url) => { invalidCalls.push(String(url)); return new Response("no"); },
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error?.name, "invalid_id");
  assert.equal(invalidCalls.length, 0);
  assertNoContentFields(invalid, "invalid id");

  const receivingFiles = [
    "src/lib/inbound/providers.ts",
    "src/lib/application-reply-processing.ts",
    "src/lib/inbox-replies.ts",
    "src/app/api/admin/resend-receiving-check/route.ts",
  ];
  for (const file of receivingFiles) {
    const src = readFileSync(file, "utf8");
    assert.match(src, /fetchResendReceivedEmail|resendReceivingApiKey|checkResendReceivingCredential/, `${file} must use the receiving helper`);
    assert.doesNotMatch(src, /Bearer \$\{(?:process\.)?env\.RESEND_API_KEY\}/, `${file} must not use the sending client for receiving`);
    assert.doesNotMatch(src, /new Resend\(\s*(?:process\.)?env\.RESEND_RECEIVING_API_KEY/, `${file} sending must not use the receiving key`);
  }
  assert.doesNotMatch(readFileSync("src/lib/inbox-replies.ts", "utf8"), /new Resend\(\s*resendReceivingApiKey/);
  assert.match(readFileSync("src/lib/inbox-replies.ts", "utf8"), /new Resend\(process\.env\.RESEND_API_KEY\)/);

  const sendingSources = walk("src").filter((file) => !receivingFiles.includes(file) && file !== "src/lib/resend-keys.ts");
  for (const file of sendingSources) {
    const src = readFileSync(file, "utf8");
    if (!/new Resend\(|api\.resend\.com/.test(src)) continue;
    assert.doesNotMatch(src, /RESEND_RECEIVING_API_KEY|resendReceivingApiKey|fetchResendReceivedEmail/, `${file} sending must not use the receiving key`);
  }

  const envExample = readFileSync(".env.example", "utf8");
  assert.match(envExample, /^RESEND_RECEIVING_API_KEY=$/m);
  assert.doesNotMatch(envExample, /RESEND_RECEIVING_API_KEY=.+/);

  const routeSrc = readFileSync("src/app/api/admin/resend-receiving-check/route.ts", "utf8");
  assert.match(routeSrc, /export async function GET/);
  assert.doesNotMatch(routeSrc, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(routeSrc, /prisma|emailLog\.create|\$executeRaw/);
  assert.match(routeSrc, /authorizeEmailTestRequest/);
  assert.match(routeSrc, /isAdmin\(/);
  assert.match(routeSrc, /mutating: false/);
  assert.match(routeSrc, /checkResendReceivingCredential/);

  process.env.ADMIN_SYNC_KEY = "receiving-check-admin-key";
  let currentUser: { id: string; email: string } | null = null;
  const checkCalls: string[] = [];
  const route = load("src/app/api/admin/resend-receiving-check/route.ts", {
    "next/server": {
      NextResponse: { json: (body: unknown, options: any) => ({ body, status: options?.status ?? 200 }) },
    },
    "@/lib/session": { getCurrentUser: async () => currentUser },
    "@/lib/admin": { isAdmin },
    "@/lib/csrf": { checkOrigin },
    "@/lib/email-test-capability": { authorizeEmailTestRequest },
    "@/lib/resend-keys": {
      checkResendReceivingCredential: async (input: { id?: unknown; requireReceivingKey?: boolean }) => {
        checkCalls.push(JSON.stringify(input));
        return {
          ok: true,
          keySlot: "receiving",
          listStatus: 200,
          fetchStatus: 200,
          fetchedId: SAMPLE_ID,
          idMatches: true,
          receivedAt: "2026-10-25T12:00:00.000Z",
          hasBody: true,
        };
      },
    },
  });
  assert.equal(typeof route.GET, "function");
  assert.equal(typeof route.POST, "undefined");
  assert.equal(typeof route.PUT, "undefined");
  assert.equal(typeof route.DELETE, "undefined");

  currentUser = null;
  const noAuth = await route.GET({
    url: "http://localhost:3000/api/admin/resend-receiving-check?requireReceivingKey=1",
    headers: new Headers(),
  });
  assert.equal(noAuth.status, 401);
  assert.equal(noAuth.body.error, "unauthorized");
  assert.equal(checkCalls.length, 0);

  currentUser = { id: "u-user", email: "not-an-admin@example.invalid" };
  const forbidden = await route.GET({
    url: "http://localhost:3000/api/admin/resend-receiving-check?requireReceivingKey=1",
    headers: new Headers({ host: "localhost:3000", origin: "http://localhost:3000" }),
  });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error, "forbidden");
  assert.equal(checkCalls.length, 0);

  currentUser = { id: "u-admin", email: "umbertogeraci0@gmail.com" };
  const sessionOk = await route.GET({
    url: "http://localhost:3000/api/admin/resend-receiving-check?requireReceivingKey=1",
    headers: new Headers({ host: "localhost:3000", origin: "http://localhost:3000" }),
  });
  assert.equal(sessionOk.status, 200);
  assert.equal(sessionOk.body.ok, true);
  assert.equal(sessionOk.body.keySlot, "receiving");
  assertNoContentFields(sessionOk.body, "session route");
  assert.match(checkCalls[0]!, /"requireReceivingKey":true/);

  currentUser = null;
  const keyOk = await route.GET({
    url: `http://localhost:3000/api/admin/resend-receiving-check?id=${SAMPLE_ID}`,
    headers: new Headers({ "x-admin-key": "receiving-check-admin-key" }),
  });
  assert.equal(keyOk.status, 200);
  assert.equal(keyOk.body.fetchedId, SAMPLE_ID);
  assertNoContentFields(keyOk.body, "admin-key route");

  const fallbackRoute = load("src/app/api/admin/resend-receiving-check/route.ts", {
    "next/server": {
      NextResponse: { json: (body: unknown, options: any) => ({ body, status: options?.status ?? 200 }) },
    },
    "@/lib/session": { getCurrentUser: async () => null },
    "@/lib/admin": { isAdmin },
    "@/lib/csrf": { checkOrigin },
    "@/lib/email-test-capability": { authorizeEmailTestRequest },
    "@/lib/resend-keys": {
      checkResendReceivingCredential: async () => ({
        ok: false,
        keySlot: "fallback",
        listStatus: null,
        fetchStatus: null,
        fetchedId: null,
        idMatches: false,
        receivedAt: null,
        hasBody: false,
        error: { name: "receiving_key_required", statusCode: null, message: "RESEND_RECEIVING_API_KEY is not set" },
      }),
    },
  });
  const required = await fallbackRoute.GET({
    url: "http://localhost:3000/api/admin/resend-receiving-check?requireReceivingKey=1",
    headers: new Headers({ "x-admin-key": "receiving-check-admin-key" }),
  });
  assert.equal(required.status, 409);
  assert.equal(required.body.keySlot, "fallback");
  assert.equal(required.body.error.name, "receiving_key_required");
  assertNoContentFields(required.body, "require receiving key");

  const panelSrc = readFileSync("src/app/(app)/admin/email-test/_panel.tsx", "utf8");
  assert.match(panelSrc, /Check receiving key/);
  assert.match(panelSrc, /resend-receiving-check\?requireReceivingKey=1/);
  assert.match(panelSrc, /method: "GET"/);
  assert.doesNotMatch(panelSrc, /X-Admin-Key|ADMIN_SYNC_KEY|fromAddress|attachments/);

  console.log("PASS resend keys: receiving slot vs sending key, fallback, sanitized error log, source fence, receiving-check.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
