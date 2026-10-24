/**
 * Application mailbox: classify, link, notify, usage, GDPR retention.
 * Fakes only — no Resend, no network, no production DB.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  classifyMailbox,
  classifyMailboxByRules,
  countsAsSentUsage,
  inboundCategoryFor,
  isExplicitRejection,
  jobApplySupport,
  linkMailboxApplication,
  mailboxKindFromAi,
  mailboxKindLabel,
  mailboxNotifyMode,
  mailboxRetentionCutoff,
  notifyDecision,
  redactMailboxBody,
} from "../src/lib/application-mailbox";
import {
  renderMailboxDigestEmail,
  renderMailboxPriorityEmail,
} from "../src/lib/application-mailbox-notify";
import { PostaView } from "../src/components/posta-view";

function load(path: string, dependencies: Record<string, unknown>) {
  const module = { exports: {} as Record<string, any> };
  const output = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(output, {
    module, exports: module.exports,
    require: (id: string) => { assert.ok(id in dependencies, `Unexpected dependency ${id}`); return dependencies[id]; },
    console, Date, Map, Set, URL, process,
  }, { filename: path });
  return module.exports;
}

function mail(from: string, subject: string, body: string) {
  return { fromAddress: from, subject, bodyText: body };
}

async function main() {
  assert.equal(classifyMailboxByRules(mail("no-reply@greenhouse.io", "Thank you for applying to Acme", "We have received your application.")).kind, "confirmation");
  assert.equal(classifyMailboxByRules(mail("no-reply@us.greenhouse-mail.io", "Security code", "Your security code is 482913")).kind, "otp");
  assert.equal(classifyMailboxByRules(mail("jane@acme.com", "Interview invitation", "We would like to invite you to an interview next week.")).kind, "interview");
  assert.equal(classifyMailboxByRules(mail("hr@acme.com", "Your application", "Could you please share your notice period?")).kind, "recruiter_question");
  assert.equal(classifyMailboxByRules(mail("careers@monzo.com", "Thanks for your email", "Unfortunately we don't take any applications over email. Please apply via our careers site.")).kind, "redirected_to_portal");
  assert.equal(classifyMailboxByRules(mail("ooo@acme.com", "Out of office", "I am out of the office until Monday.")).kind, "auto_reply");
  assert.equal(classifyMailboxByRules(mail("hr@acme.com", "Update", "Unfortunately we have decided to move forward with other candidates.")).kind, "rejection");
  assert.ok(isExplicitRejection("We regret to inform you that we will not be moving forward."));
  assert.equal(classifyMailboxByRules(mail("hr@acme.com", "Update", "Unfortunately the volume is high this week.")).kind, "other");
  assert.equal(mailboxKindFromAi("rejection"), null);
  assert.equal(mailboxKindFromAi("interview"), "interview");
  const aiRejected = await classifyMailbox(mail("x@y.com", "Hi", "unclear"), async () => "rejection");
  assert.deepEqual(aiRejected, { kind: "other", by: "rules" });
  const aiInterview = await classifyMailbox(mail("x@y.com", "Hi", "unclear"), async () => "interview");
  assert.deepEqual(aiInterview, { kind: "interview", by: "ai" });

  assert.equal(inboundCategoryFor("otp"), "incomplete");
  assert.equal(inboundCategoryFor("redirected_to_portal"), "incomplete");
  assert.equal(inboundCategoryFor("confirmation"), "confirmation");
  assert.equal(notifyDecision("interview", "priority"), "pending");
  assert.equal(notifyDecision("confirmation", "priority"), "digest_queued");
  assert.equal(notifyDecision("recruiter_question", "digest"), "digest_queued");
  assert.equal(notifyDecision("interview", "off"), "skipped");
  assert.equal(notifyDecision("otp", "priority"), "skipped");
  assert.equal(mailboxNotifyMode("DIGEST"), "digest");
  assert.equal(mailboxKindLabel("ricevuta", "it"), "Ricevuta");
  assert.equal(mailboxKindLabel("colloquio", "en"), "Interview invite");

  const otpBody = "Your security code is 482913. Enter 482913 to continue.";
  assert.ok(!redactMailboxBody("otp", otpBody)?.includes("482913"));
  assert.equal(redactMailboxBody("confirmation", "Thanks 482913"), "Thanks 482913");

  const jobs = [
    { id: "a1", company: "Acme", title: "Backend Engineer", url: "https://boards.greenhouse.io/acme/jobs/1", at: new Date("2026-10-20") },
    { id: "a2", company: "Globex", title: "Data Analyst", url: "https://jobs.lever.co/globex/2", at: new Date("2026-10-21") },
  ];
  assert.equal(linkMailboxApplication(jobs, { from: "x@y.com", subject: "x", body: "y" }, "a1"), "a1");
  assert.equal(linkMailboxApplication(jobs, { from: "no-reply@greenhouse.io", subject: "Thank you for applying to Acme", body: "Backend Engineer" }), "a1");
  assert.equal(jobApplySupport("https://boards.greenhouse.io/acme/jobs/1"), "supported");
  assert.equal(jobApplySupport("https://jobs.ashbyhq.com/acme/abc"), "unsupported");
  assert.equal(jobApplySupport("https://www.linkedin.com/jobs/view/1"), "unsupported");

  assert.equal(countsAsSentUsage({ confirmedAt: new Date() }), true);
  assert.equal(countsAsSentUsage({ submitConfirmation: "APPLIED" }), true);
  assert.equal(countsAsSentUsage({ submitConfirmation: "UNCONFIRMED" }), false);
  assert.equal(countsAsSentUsage({ status: "success", submitConfirmation: "DETECTED_HTTP_200" }), true);
  const cutoff = mailboxRetentionCutoff(new Date("2026-10-24T00:00:00Z"), 180);
  assert.equal(cutoff.toISOString().slice(0, 10), "2026-04-27");

  const priority = renderMailboxPriorityEmail({ name: "Mario", locale: "it" }, {
    id: "m1", kind: "interview", fromAddress: "jane@acme.com", subject: "Chat?", receivedAt: new Date(),
    jobTitle: "Backend", company: "Acme",
  });
  assert.match(priority.subject, /colloquio/i);
  assert.match(priority.text, /Non rispondiamo noi al recruiter/);
  assert.doesNotMatch(priority.text, /reply\+/);
  const digest = renderMailboxDigestEmail({ name: "Mario", locale: "it" }, [{
    id: "m2", kind: "confirmation", fromAddress: "no-reply@acme.com", subject: "Ricevuta", receivedAt: new Date(),
    jobTitle: "Backend", company: "Acme",
  }]);
  assert.match(digest.subject, /Posta candidature/);
  assert.match(digest.text, /non è una risposta al recruiter/i);

  const sent: string[] = [];
  const fakeSend = async (input: { to: string; idempotencyKey: string }) => {
    sent.push(`${input.to}:${input.idempotencyKey}`);
    return "fake-id";
  };
  const quota = load("src/lib/application-mailbox-notify.ts", {
    "@/lib/email-quota": { sendWithinQuota: async (_k: string, _to: string, fn: () => Promise<void>) => { await fn(); return { sent: true }; } },
    "@/lib/application-mailbox": { mailboxKindLabel, mailboxNotifyMode },
  });
  assert.equal(await quota.sendMailboxPriorityNotice({
    userEmail: "user@example.test", user: { name: "Mario", locale: "it" },
    message: { id: "n1", kind: "interview", fromAddress: "jane@acme.com", subject: "Chat", receivedAt: new Date(), jobTitle: "BE", company: "Acme" },
    send: fakeSend,
  }), true);
  assert.equal(await quota.sendMailboxDigest({
    userEmail: "user@example.test", user: { name: "Mario" },
    messages: [{ id: "n2", kind: "confirmation", fromAddress: "ats@acme.com", subject: "Ok", receivedAt: new Date(), jobTitle: "BE", company: "Acme" }],
    send: fakeSend,
  }), true);
  assert.deepEqual(sent, ["user@example.test:mailbox-priority/n1", `user@example.test:mailbox-digest/user@example.test/${new Date().toISOString().slice(0, 10)}`]);
  assert.equal(quota.createResendMailboxMailer({}), null, "no key → no Resend client");

  const replies: any[] = [];
  const inbound: any[] = [];
  const users = new Map([["u1", { email: "user@example.test", name: "Mario", locale: "it", preferences: { mailboxNotifyMode: "priority" } }]]);
  const digestDb = {
    applicationReply: {
      findMany: async () => [{
        id: "r1", kind: "ricevuta", fromAddress: "ats@acme.com", subject: "Received", receivedAt: new Date(),
        application: { userId: "u1", job: { title: "BE", company: "Acme" } },
      }],
      updateMany: async ({ where, data }: any) => { for (const row of replies) if (where.id.in.includes(row.id)) row.notifyStatus = data.notifyStatus; return { count: 1 }; },
    },
    inboundEmail: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
    },
    user: { findUnique: async ({ where }: any) => users.get(where.id) ?? null },
  };
  replies.push({ id: "r1", notifyStatus: "digest_queued" });
  const digestMod = load("src/lib/application-mailbox-digest.ts", {
    "@/lib/db": { prisma: digestDb },
    "@/lib/application-mailbox": { mailboxNotifyMode },
    "@/lib/application-mailbox-notify": { sendMailboxDigest: async () => true },
    "@/lib/admin": { isTestAccount: () => false },
  });
  const digestResult = await digestMod.runMailboxDigest({ send: async () => "ok" });
  assert.equal(digestResult.sent, 1);
  assert.equal(replies[0].notifyStatus, "digest_sent");

  const storeApps = [{
    id: "app1", confirmedAt: new Date("2026-10-24T10:00:00Z"),
    job: { title: "Backend", company: "Acme", url: "https://boards.greenhouse.io/acme/jobs/1" },
    replies: [{
      id: "receipt", kind: "ricevuta", fromAddress: "no-reply@acme.com", subject: "Thanks",
      bodyText: "We received it.", receivedAt: new Date("2026-10-24T10:00:00Z"),
    }],
    inboundEmails: [{
      id: "ie-otp", mailboxKind: "otp", category: "incomplete",
      fromAddress: "no-reply@gh.io", subject: "Security code", bodyText: "Your security code is 999888",
      receivedAt: new Date("2026-10-24T09:00:00Z"),
    }],
  }];
  const store = load("src/lib/application-mailbox-store.ts", {
    "@/lib/db": { prisma: {
      application: { findMany: async () => storeApps },
      applicationReply: { deleteMany: async ({ where }: any) => { assert.ok(where.receivedAt.lt); assert.equal(where.isSecurityCode, undefined); return { count: 2 }; } },
      inboundEmail: { deleteMany: async () => ({ count: 1 }) },
    } },
    "@/lib/application-mailbox": { mailboxKindLabel, redactMailboxBody },
  });
  const threads = await store.listMailboxThreads("u1", "it");
  assert.equal(threads.length, 1);
  assert.equal(threads[0].confirmedFrom, "no-reply@acme.com");
  assert.ok(JSON.stringify(threads).includes("Ricevuta"));
  assert.ok(!JSON.stringify(threads).includes("999888"));
  const purged = await store.purgeExpiredMailbox(new Date("2026-10-24T00:00:00Z"), 180);
  assert.equal(purged.replies, 2);
  assert.equal(purged.inbound, 1);

  const markup = renderToStaticMarkup(createElement(PostaView, {
    locale: "it",
    threads: [{
      applicationId: "app1", jobTitle: "Backend", company: "Acme", jobUrl: "https://x",
      confirmedAt: "2026-10-24T10:00:00.000Z", confirmedFrom: "ats@acme.com", confirmedSubject: "Thanks",
      messages: [{
        id: "inbound:ie1", source: "inbound", kind: "confirmation", label: "Ricevuta",
        fromAddress: "ats@acme.com", subject: "Thanks", bodyText: "We received it.",
        receivedAt: "2026-10-24T10:00:00.000Z",
      }],
    }],
  }));
  assert.match(markup, /Posta candidature/);
  assert.match(markup, /Ricevuta confermata/);
  assert.match(markup, /ats@acme.com/);

  const cronDigest = load("src/app/api/cron/mailbox-digest/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) } },
    "@/lib/application-mailbox-digest": { runMailboxDigest: async () => ({ sent: 0, skipped: 0, errors: 0 }) },
    "@/lib/application-mailbox-notify": { createResendMailboxMailer: () => null },
  });
  const unauthorized = await cronDigest.GET({ headers: { get: () => null } });
  assert.equal(unauthorized.status, 401);
  process.env.CRON_SECRET = "s";
  const skipped = await cronDigest.GET({ headers: { get: (n: string) => n === "authorization" ? "Bearer s" : null } });
  assert.equal(skipped.body.skipped, "no_resend_key");
  delete process.env.CRON_SECRET;

  console.log("application mailbox (unit): all tests passed");
}

main().catch((e) => { process.stderr.write(String(e?.stack ?? e) + "\n"); process.exit(1); });
