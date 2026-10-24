import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Hermetic Gmail crash/dedup checks. Only explicitly injected HTTP fixtures run.
let fixtureFetch: (url: string) => Promise<unknown> = async () => { throw new Error("Network forbidden"); };
function load(path: string, dependencies: Record<string, unknown>) {
  const module = { exports: {} as Record<string, any> };
  const output = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  vm.runInNewContext(output, { module, exports: module.exports, Date, URL,
    console: { log() {}, warn() {}, error() {} }, process: { env: {} },
    require: (id: string) => { assert.ok(id in dependencies, `Unexpected dependency ${id}`); return dependencies[id]; },
    fetch: (url: string) => fixtureFetch(url),
  }, { filename: path });
  return module.exports;
}
const messages: Array<Record<string, any>> = [];
const apps = [{ id: "owned", userId: "owner", replyCount: 0, lastReplyAt: null as Date | null, userStatus: null }, { id: "other", userId: "someone-else", replyCount: 0, lastReplyAt: null, userStatus: null }];
let failProjection = true;
const tx = {
  account: { findFirst: async () => ({ access_token: "synthetic-only", expires_at: Math.floor(Date.now() / 1000) + 3600 }) },
  gmailMessage: {
    findUnique: async ({ where: { userId_gmailMessageId: key } }: any) => messages.find((row) => row.userId === key.userId && row.gmailMessageId === key.gmailMessageId),
    create: async ({ data }: any) => { messages.push(data); return data; },
  },
  application: {
    findFirst: async ({ where }: any) => apps.find((app) => app.id === where.id && app.userId === where.userId),
    findUnique: async ({ where }: any) => apps.find((app) => app.id === where.id),
    update: async ({ where, data }: any) => {
      if (failProjection) throw new Error("synthetic_projection_failure");
      const app = apps.find((app) => app.id === where.id)!;
      if (data.replyCount?.increment) app.replyCount += data.replyCount.increment;
      if (data.lastReplyAt) app.lastReplyAt = data.lastReplyAt;
      if (data.lastReplyKind) (app as { lastReplyKind?: string }).lastReplyKind = data.lastReplyKind;
      return app;
    },
  },
};
const security = load("src/lib/application-security-code.ts", {});
const replySecurity = load("src/lib/reply-security-message.ts", { "@/lib/application-security-code": security });
const parser = load("src/lib/reply-parser.ts", { "@/lib/reply-security-message": replySecurity });
const projection = load("src/lib/apply-reply-to-application.ts", { "@/lib/db": { prisma: tx }, "@/lib/reply-parser": parser });
const gmail = load("src/lib/gmail-client.ts", {
  "@/lib/db": { prisma: tx }, "@/lib/reply-parser": parser, "@/lib/reply-security-message": replySecurity,
  "@/lib/apply-reply-to-application": projection,
  "@/lib/gmail-match": { isLikelyJobMail: () => true, matchToApplication: async () => "owned" },
  "@/lib/gmail-body": { extractGmailBody: (payload: { body: { data: string } }) => Buffer.from(payload.body.data, "base64url").toString("utf8") },
  "@/lib/application-delivery": { emailTransaction: async (work: any) => {
    const messageCount = messages.length;
    const counts = apps.map((app) => app.replyCount);
    try { return await work(tx); } catch (error) {
      messages.length = messageCount;
      apps.forEach((app, index) => { app.replyCount = counts[index]; });
      throw error;
    }
  } },
});
async function main() {
  const input = { userId: "owner", gmailMessageId: "gmail-one", threadId: "thread", applicationId: "owned", label: "Response",
    parsed: { from: "recruiter@example.test", to: "owner@example.test", subject: "Interview", date: new Date("2026-10-13T12:00:00Z"), bodyText: "Can we schedule an interview?", snippet: "Interview" },
    classified: { kind: "colloquio", isHuman: true },
  };
  await assert.rejects(gmail.storeGmailReply(input), /projection_failure/);
  assert.equal(messages.length, 0, "Projection failure must roll back source insert");
  assert.equal(apps[0].replyCount, 0);
  failProjection = false;
  assert.equal(await gmail.storeGmailReply(input), true);
  assert.equal(messages.length, 1); assert.equal(apps[0].replyCount, 1); assert.equal(apps[0].lastReplyAt, input.parsed.date);
  assert.equal(await gmail.storeGmailReply(input), false);
  assert.equal(messages.length, 1); assert.equal(apps[0].replyCount, 1);
  assert.equal(await gmail.storeGmailReply({ ...input, gmailMessageId: "gmail-cross-owner", applicationId: "other" }), true);
  assert.equal(messages[1].applicationId, null, "Matcher cannot attach another owner's application");
  assert.equal(apps[1].replyCount, 0);
  assert.equal(await gmail.storeGmailReply({ ...input, gmailMessageId: "gmail-receipt", classified: { kind: "ricevuta", isHuman: false } }), true);
  assert.equal(apps[0].replyCount, 1, "Receipt does not inflate human response count");
  assert.equal(gmail.isOwnForwardNotification("LavorAI <noreply@lavorai.it>", "Forwarded message\nInoltrato da LavorAI."), true);
  assert.equal(gmail.isOwnForwardNotification("Recruiter <person@example.test>", "Inoltrato da LavorAI."), false);
  const longBody = "Interview invitation\n" + "Long substantive recruiter message. ".repeat(210) + "\nInoltrato da LavorAI.";
  const longForward = { id: "gmail-long-forward", threadId: "forward-thread", payload: {
    headers: [{ name: "From", value: "LavorAI <noreply@lavorai.it>" }, { name: "Subject", value: "Possibile colloquio" }],
    mimeType: "text/plain", body: { data: Buffer.from(longBody).toString("base64url") },
  } };
  assert.ok(longBody.indexOf("Inoltrato da LavorAI.") > 5000);
  const parsedLong = gmail.parseGmailMessage(longForward);
  assert.equal(parsedLong.bodyText.length, 5000, "Retained body keeps existing cap");
  assert.equal(parsedLong.ownForwardNotification, true, "Forward marker inspected before truncation");
  assert.equal(gmail.isOwnForwardNotification('"noreply@lavorai.it" <recruiter@example.test>', longBody), false, "Display name cannot impersonate the app mailbox");
  assert.equal(gmail.isOwnForwardNotification("LavorAI <noreply@lavorai.it>", "Ordinary application notification without forward marker"), false, "App sender alone must not suppress mail");
  const beforeMessages = messages.length;
  const beforeReplies = apps[0].replyCount;
  fixtureFetch = async (url) => {
    if (url === "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&labelIds=INBOX") return { ok: true, json: async () => ({ messages: [{ id: longForward.id, threadId: longForward.threadId }] }) };
    assert.equal(url, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${longForward.id}?format=full`);
    return { ok: true, json: async () => longForward };
  };
  const longSync = await gmail.syncGmailMessages("owner");
  assert.equal(longSync.synced, 0); assert.equal(longSync.skipped, 1); assert.equal(longSync.error, undefined);
  assert.equal(messages.length, beforeMessages); assert.equal(apps[0].replyCount, beforeReplies, "Long forwarded reply must not double-count through Gmail");
  fixtureFetch = async () => { throw new Error("Network forbidden"); };
  assert.equal(parser.classifyReply({ fromAddress: "person@example.test", subject: "Interview", bodyText: "Did your verification code work? Can we schedule a call?" }).kind, "colloquio");
  console.log("PASS Gmail atomic source+projection rollback, idempotent retry, owner isolation, receipt metrics, long-body forwarding-loop suppression, mailbox spoof resistance and human verification discussion.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
