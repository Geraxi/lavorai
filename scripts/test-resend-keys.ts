import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  fetchResendReceivedEmail,
  logResendReceivingError,
  resendReceivingApiKey,
  resendReceivingAuthorization,
  resendReceivingKeySlot,
  resendSendingApiKey,
  sanitizeResendLogText,
} from "../src/lib/resend-keys";

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

  const receivingFiles = [
    "src/lib/inbound/providers.ts",
    "src/lib/application-reply-processing.ts",
    "src/lib/inbox-replies.ts",
  ];
  for (const file of receivingFiles) {
    const src = readFileSync(file, "utf8");
    assert.match(src, /fetchResendReceivedEmail|resendReceivingApiKey/, `${file} must use the receiving helper`);
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

  console.log("PASS resend keys: receiving slot vs sending key, fallback, sanitized error log, source fence.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
