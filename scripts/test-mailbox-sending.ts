/**
 * Unit test invio dalla casella utente. NESSUNA rete: fetch globale bloccato,
 * client Gmail/Graph pilotati da fetch finti.
 */
import assert from "node:assert/strict";
globalThis.fetch = (async () => { throw new Error("NETWORK_FORBIDDEN_IN_TESTS"); }) as typeof fetch;

import { resolveSendMode } from "../src/lib/mailbox/send-guard";
import { buildMime, encodeHeader, assertSafeAddress } from "../src/lib/mailbox/mime";
import { canTransition, evaluateDelivery, isBounceMessage, type ThreadMessage } from "../src/lib/mailbox/delivery-state";
import { gmailClient, graphClient, ProviderSendError } from "../src/lib/mailbox/providers";
import { signState, verifyState, hasSendScope, hasRequiredScopes, authorizeUrl } from "../src/lib/mailbox/oauth";
import { GMAIL_SCOPES } from "../src/lib/mailbox/providers";

// --- send guard -------------------------------------------------------------
assert.deepEqual(resolveSendMode({ NODE_ENV: "test", MAILBOX_SEND_LIVE: "true" }), { live: false, reason: "test_env" });
assert.deepEqual(resolveSendMode({ NODE_ENV: "development" }), { live: false, reason: "non_production" });
assert.deepEqual(resolveSendMode({ NODE_ENV: "development", MAILBOX_SEND_LIVE: "true" }), { live: true });
assert.deepEqual(resolveSendMode({ NODE_ENV: "production", VERCEL_ENV: "preview" }), { live: false, reason: "non_production" });
// Un `next start` locale (NODE_ENV=production senza VERCEL_ENV) NON invia.
assert.deepEqual(resolveSendMode({ NODE_ENV: "production" }), { live: false, reason: "non_production" });
assert.deepEqual(resolveSendMode({ NODE_ENV: "production", VERCEL_ENV: "production" }), { live: true });
assert.deepEqual(resolveSendMode({ NODE_ENV: "production", VERCEL_ENV: "production", APPLICATIONS_PAUSED: "1" }), { live: false, reason: "applications_paused" });
assert.deepEqual(resolveSendMode({ NODE_ENV: "production", VERCEL_ENV: "production", MAILBOX_SEND_DRY_RUN: "true" }), { live: false, reason: "dry_run_flag" });
assert.deepEqual(resolveSendMode({}), { live: false, reason: "non_production" });

// --- MIME -------------------------------------------------------------------
const pdf = Buffer.from("%PDF-1.4 fake");
const mime = buildMime({ from: "Mario Rossi <mario@gmail.com>", to: "jobs@acme.it", subject: "Candidatura: Sviluppatore – Mario", text: "Gentile team,\nàèì", attachments: [{ filename: "CV_Mario.pdf", contentType: "application/pdf", content: pdf }], messageId: "<x@gmail.com>" }, "BOUND");
assert.match(mime, /^From: Mario Rossi <mario@gmail.com>\r\nTo: jobs@acme.it\r\nSubject: =\?UTF-8\?B\?/);
assert.match(mime, /Message-ID: <x@gmail.com>/);
assert.match(mime, /Content-Disposition: attachment; filename="CV_Mario.pdf"/);
assert.ok(mime.includes(pdf.toString("base64")));
assert.ok(mime.trimEnd().endsWith("--BOUND--"));
assert.equal(encodeHeader("plain"), "plain");
for (const bad of ["a@b.it\r\nBcc: x@y.it", "a@b.it, c@d.it", "nope", "<a@b.it>"]) assert.throws(() => assertSafeAddress(bad));
assert.throws(() => buildMime({ from: "m@g.com", to: "j@a.it", subject: "x\r\nBcc: e@v.il", text: "", attachments: [], messageId: "<a@b>" }));

// --- bounce / state machine ------------------------------------------------
const sentAt = new Date("2026-10-20T08:00:00Z");
const ours: ThreadMessage = { id: "m1", from: "Mario <mario@gmail.com>", subject: "Candidatura", date: sentAt, isOurs: true };
const dsn: ThreadMessage = { id: "m2", from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>", subject: "Delivery Status Notification (Failure)", date: new Date("2026-10-20T08:01:00Z") };
const ndr: ThreadMessage = { id: "m3", from: "Microsoft Outlook <MicrosoftExchange329e71ec88ae4615bbc36ab6ce41109e@contoso.com>", subject: "Non recapitabile: Candidatura", date: null };
const delay: ThreadMessage = { id: "m4", from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>", subject: "Delivery Status Notification (Delay)", date: null };
const human: ThreadMessage = { id: "m5", from: "Giulia HR <giulia@acme.it>", subject: "Re: Candidatura", date: null };
assert.ok(isBounceMessage(dsn) && isBounceMessage(ndr));
assert.ok(!isBounceMessage(human) && !isBounceMessage(ours));
const at = (h: number) => new Date(sentAt.getTime() + h * 3_600_000);
assert.equal(evaluateDelivery({ submittedAt: sentAt, now: at(1), thread: [ours, dsn], successfulChecks: 1 }).state, "failed");
assert.equal(evaluateDelivery({ submittedAt: sentAt, now: at(1), thread: [ours], successfulChecks: 1 }).state, "pending");
assert.equal(evaluateDelivery({ submittedAt: sentAt, now: at(49), thread: [ours, delay, human], successfulChecks: 3 }).state, "delivery_confirmed");
assert.equal(evaluateDelivery({ submittedAt: sentAt, now: at(49), thread: null, successfulChecks: 0 }).state, "unverified");
assert.equal(evaluateDelivery({ submittedAt: sentAt, now: at(49), thread: [ours, ndr], successfulChecks: 2 }).state, "failed");
assert.ok(canTransition("submitted", "delivery_confirmed") && canTransition("delivery_confirmed", "failed"));
assert.ok(!canTransition("prepared", "submitted") && !canTransition("failed", "submitted") && !canTransition("prepared", "delivery_confirmed"));

// --- providers (fake fetch) ------------------------------------------------
type Call = { url: string; init?: RequestInit };
function fakeFetch(responses: Array<{ status: number; body?: unknown } | Error>) {
  const calls: Call[] = [];
  const f = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (!r) throw new Error("unexpected call");
    if (r instanceof Error) throw r;
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
  };
  return { f, calls };
}
const mail = { from: "mario@gmail.com", to: "jobs@acme.it", subject: "Candidatura", text: "Lettera", attachments: [{ filename: "CV.pdf", contentType: "application/pdf", content: pdf }], messageId: "<id1@gmail.com>" };

async function main() {
  {
    const { f, calls } = fakeFetch([{ status: 200, body: { id: "gm1", threadId: "th1" } }]);
    const r = await gmailClient("tok", f).send(mail);
    assert.deepEqual(r, { providerMessageId: "gm1", providerThreadId: "th1", internetMessageId: "<id1@gmail.com>" });
    assert.equal(calls[0].url, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    const raw = Buffer.from(JSON.parse(String(calls[0].init?.body)).raw, "base64url").toString("utf8");
    assert.match(raw, /To: jobs@acme.it/);
    assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, "Bearer tok");
  }
  for (const [status, kind] of [[400, "rejected"], [401, "auth"], [500, "unknown"], [429, "unknown"]] as const) {
    const { f } = fakeFetch([{ status }]);
    await assert.rejects(gmailClient("t", f).send(mail), (e: unknown) => e instanceof ProviderSendError && e.kind === kind);
  }
  {
    const { f } = fakeFetch([new Error("ETIMEDOUT")]);
    await assert.rejects(gmailClient("t", f).send(mail), (e: unknown) => e instanceof ProviderSendError && e.kind === "unknown");
  }
  {
    const { f, calls } = fakeFetch([{ status: 201, body: { id: "d1", conversationId: "c1", internetMessageId: "<id1@gmail.com>" } }, { status: 202 }]);
    const r = await graphClient("tok", f).send(mail);
    assert.deepEqual(r, { providerMessageId: "d1", providerThreadId: "c1", internetMessageId: "<id1@gmail.com>" });
    assert.equal(calls[1].url, "https://graph.microsoft.com/v1.0/me/messages/d1/send");
    const draft = JSON.parse(String(calls[0].init?.body));
    assert.equal(draft.toRecipients[0].emailAddress.address, "jobs@acme.it");
    assert.equal(draft.attachments[0].contentBytes, pdf.toString("base64"));
  }
  {
    // Bozza fallita = nessun invio: rifiuto sicuro.
    const { f } = fakeFetch([{ status: 403 }]);
    await assert.rejects(graphClient("t", f).send(mail), (e: unknown) => e instanceof ProviderSendError && e.kind === "rejected");
    const g = fakeFetch([{ status: 201, body: { id: "d1", conversationId: "c1" } }, new Error("socket hang up")]);
    await assert.rejects(graphClient("t", g.f).send(mail), (e: unknown) => e instanceof ProviderSendError && e.kind === "unknown");
  }
  {
    const { f } = fakeFetch([{ status: 200, body: { messages: [
      { id: "gm1", internalDate: String(sentAt.getTime()), payload: { headers: [{ name: "From", value: "mario@gmail.com" }, { name: "Subject", value: "Candidatura" }] } },
      { id: "gm2", payload: { mimeType: "multipart/report", headers: [{ name: "From", value: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>" }, { name: "Subject", value: "Delivery Status Notification (Failure)" }] } },
    ] } }]);
    const t = await gmailClient("t", f).readThread({ providerMessageId: "gm1", providerThreadId: "th1", internetMessageId: null });
    assert.equal(t[0].isOurs, true);
    assert.ok(isBounceMessage(t[1]));
  }
  {
    const { f, calls } = fakeFetch([{ status: 200, body: { value: [{ id: "x", subject: "Undeliverable: Candidatura", from: { emailAddress: { name: "Microsoft Outlook", address: "postmaster@outlook.com" } } }] } }]);
    const t = await graphClient("t", f).readThread({ providerMessageId: "d1", providerThreadId: "c'1", internetMessageId: "<id1@gmail.com>" });
    assert.ok(decodeURIComponent(calls[0].url).includes("conversationId eq 'c''1'"));
    assert.ok(isBounceMessage(t[0]));
  }

  // --- OAuth state --------------------------------------------------------
  const st = signState("u1", "gmail", "s".repeat(32), 1_000);
  assert.deepEqual(verifyState(st, "s".repeat(32), 2_000), { userId: "u1", provider: "gmail" });
  assert.equal(verifyState(st, "s".repeat(32), 1_000 + 601_000), null);
  assert.equal(verifyState(st, "x".repeat(32), 2_000), null);
  assert.equal(verifyState(st.replace(/^./, "A"), "s".repeat(32), 2_000), null);
  assert.ok(hasSendScope("gmail", "openid https://www.googleapis.com/auth/gmail.send") && !hasSendScope("gmail", "gmail.readonly"));
  assert.ok(hasSendScope("outlook", "Mail.Send User.Read"));
  const u = new URL(authorizeUrl("gmail", "http://localhost/cb", "st", { GOOGLE_CLIENT_ID: "cid" }));
  assert.equal(u.searchParams.get("scope"), "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly openid email");
  assert.ok(!GMAIL_SCOPES.some((s) => s.includes("gmail.metadata")), "gmail.metadata must not be requested");
  const G = "https://www.googleapis.com/auth/";
  assert.ok(hasRequiredScopes("gmail", `openid ${G}gmail.send ${G}gmail.readonly email`));
  assert.ok(hasRequiredScopes("gmail", `${G}gmail.send ${G}gmail.metadata`), "legacy metadata connections still valid");
  assert.ok(!hasRequiredScopes("gmail", `${G}gmail.send`), "send without thread read is rejected");
  assert.ok(!hasRequiredScopes("gmail", `${G}gmail.readonly`), "read without send is rejected");
  assert.ok(hasRequiredScopes("outlook", "Mail.Send Mail.ReadWrite User.Read offline_access") && !hasRequiredScopes("outlook", "Mail.Send"));
  {
    // Lettura thread con readonly: format=metadata, solo intestazioni necessarie, nessun corpo.
    const { f, calls } = fakeFetch([{ status: 200, body: { messages: [] } }]);
    await gmailClient("t", f).readThread({ providerMessageId: "gm1", providerThreadId: "th1", internetMessageId: null });
    const tu = new URL(calls[0].url);
    assert.equal(tu.pathname, "/gmail/v1/users/me/threads/th1");
    assert.equal(tu.searchParams.get("format"), "metadata");
    assert.deepEqual(tu.searchParams.getAll("metadataHeaders"), ["From", "Subject", "Date", "Content-Type"]);
  }
  assert.equal(u.searchParams.get("access_type"), "offline");
  const m = new URL(authorizeUrl("outlook", "http://localhost/cb", "st", { MS_CLIENT_ID: "mid" }));
  assert.match(m.searchParams.get("scope") ?? "", /Mail\.Send/);
  assert.match(m.pathname, /\/common\//);

  console.log("mailbox sending (unit): all tests passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
