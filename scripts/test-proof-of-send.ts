/**
 * Proof-of-send + Gmail MIME unit tests. NO network, NO database:
 * fetch is blocked and the mailbox service runs against an in-memory fake.
 * Run: npx tsx scripts/test-proof-of-send.ts
 */
import assert from "node:assert/strict";
globalThis.fetch = (async () => { throw new Error("NETWORK_FORBIDDEN_IN_TESTS"); }) as typeof fetch;

import { isValidProof, notSubmitted, portalProof, submittedWithProof } from "../src/lib/proof-of-send";
import { buildMime, encodeHeader, formatFrom, rfc2822Date, toBase64Url } from "../src/lib/mailbox/mime";
import { gmailDailySendCap, romeDayStart } from "../src/lib/mailbox/send-guard";
import { gmailClient, ProviderSendError } from "../src/lib/mailbox/providers";
import { sendApprovedMailbox, makeClientFor, type MailboxDeps } from "../src/lib/mailbox/service";

// --- proof helpers ----------------------------------------------------------
assert.throws(() => submittedWithProof({ type: "gmail_message_id", ref: "" }), /proof_required/);
assert.throws(() => submittedWithProof({ type: "gmail_message_id", ref: "dryrun-abc" }), /proof_required/);
assert.throws(() => submittedWithProof({ type: "bogus" as never, ref: "x" }), /proof_required/);
const at = new Date("2026-10-23T10:00:00Z");
assert.deepEqual(submittedWithProof({ type: "gmail_message_id", ref: " 18c2 " }, at),
  { sendStatus: "submitted", sendFailureReason: null, sentProofType: "gmail_message_id", sentProofRef: "18c2", sentAt: at });
assert.deepEqual(notSubmitted("needs_user", "x\r\ny"), { sendStatus: "needs_user", sendFailureReason: "x y" });
assert.ok(!("sentProofType" in notSubmitted("failed", "r")));
assert.equal(portalProof({ receipt: null }), null);
assert.equal(portalProof({ receipt: null, postSubmitScreenshotUrl: "https://blob.example/s.png" })?.type, "success_page_screenshot");
assert.equal(portalProof({ receipt: null, postSubmitScreenshotUrl: "http://insecure/s.png" }), null);
const rp = portalProof({ receipt: { provider: "greenhouse", kind: "http", receiptId: "app_1", capturedAt: at.toISOString(), jobId: "123" } });
assert.equal(rp?.type, "ats_submission_receipt"); assert.ok(isValidProof(rp));

// --- MIME -------------------------------------------------------------------
const pdf = Buffer.from("%PDF-1.4\n%âãÏÓ binary\x00\xff", "latin1");
const mime = buildMime({ from: "mario@gmail.com", fromName: "Mario Rossì", to: "jobs@acme.it",
  subject: "Candidatura: Sviluppatore Senior Full-Stack – Mario Rossì – Milano, Italia", text: "Gentile team,\r\nàèì",
  attachments: [{ filename: "CV_Mario_Rossì.pdf", contentType: "application/pdf", content: pdf }], messageId: "<x@gmail.com>" }, "BOUND", at);
const [head, body] = [mime.split("\r\n\r\n")[0], mime.split("\r\n\r\n").slice(1).join("\r\n\r\n")];
assert.match(head, /^From: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <mario@gmail.com>\r\n/);
assert.match(head, /\r\nDate: Fri, 23 Oct 2026 10:00:00 \+0000\r\n/);
assert.match(head, /\r\nMIME-Version: 1\.0\r\n/);
assert.match(head, /Content-Type: multipart\/mixed; boundary="BOUND"$/);
for (const line of mime.split("\r\n")) assert.ok(line.length <= 998, "RFC 5322 line limit");
for (const w of head.match(/=\?UTF-8\?B\?[^?]+\?=/g) ?? []) assert.ok(w.length <= 75, "RFC 2047 encoded-word limit");
assert.ok(!/[^\r]\n/.test(mime), "CRLF only");
assert.match(body, /Content-Disposition: attachment; filename="CV_Mario_Rossi_?\.pdf"; filename\*=UTF-8''CV_Mario_Ross%C3%AC\.pdf/);
const pdfPart = body.split("--BOUND")[2].split("\r\n\r\n")[1].replace(/\r\n/g, "");
assert.deepEqual(Buffer.from(pdfPart, "base64"), pdf, "PDF bytes survive round-trip");
const raw = toBase64Url(mime);
assert.ok(/^[A-Za-z0-9_-]+$/.test(raw), "base64url without padding");
assert.equal(Buffer.from(raw, "base64url").toString("utf8"), mime);
assert.equal(formatFrom("Mario Rossi <mario@gmail.com>"), "Mario Rossi <mario@gmail.com>");
assert.equal(formatFrom("mario@gmail.com", "O'Neil, Jr."), "\"O'Neil, Jr.\" <mario@gmail.com>");
assert.equal(formatFrom("mario@gmail.com", null), "mario@gmail.com");
assert.equal(rfc2822Date(at), "Fri, 23 Oct 2026 10:00:00 +0000");
assert.equal(encodeHeader("plain"), "plain");
assert.throws(() => buildMime({ from: "m@g.com", fromName: "x\r\nBcc: a@b.c", to: "j@a.it", subject: "s", text: "", attachments: [], messageId: "<a@b>" }));
assert.throws(() => buildMime({ from: "m@g.com", to: "j@a.it", subject: "s", text: "", attachments: [], messageId: "no-brackets" }));

// --- cap helpers ------------------------------------------------------------
assert.equal(gmailDailySendCap({}), 10);
assert.equal(gmailDailySendCap({ GMAIL_DAILY_SEND_CAP: "3" }), 3);
assert.equal(gmailDailySendCap({ GMAIL_DAILY_SEND_CAP: "0" }), 0);
assert.equal(gmailDailySendCap({ GMAIL_DAILY_SEND_CAP: "-1" }), 10);
assert.equal(romeDayStart(new Date("2026-10-23T21:30:00Z")).toISOString(), "2026-10-22T22:00:00.000Z"); // CEST
assert.equal(romeDayStart(new Date("2026-10-23T22:30:00Z")).toISOString(), "2026-10-23T22:00:00.000Z");
assert.equal(romeDayStart(new Date("2026-12-01T12:00:00Z")).toISOString(), "2026-11-30T23:00:00.000Z"); // CET

// --- in-memory fake DB for the mailbox service --------------------------------
type Row = Record<string, any>;
function match(row: Row, where: Row): boolean {
  return Object.entries(where ?? {}).every(([k, v]) => {
    if (k === "OR") return (v as Row[]).some((w) => match(row, w));
    if (k === "user") return true;
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("not" in v) return v.not === null ? row[k] != null : row[k] !== v.not && (typeof v.not !== "object" || !match({ [k]: row[k] }, { [k]: v.not }));
      if ("in" in v) return (v.in as unknown[]).includes(row[k]);
      if ("gte" in v) return row[k] != null && row[k] >= v.gte;
      return false;
    }
    return row[k] === v;
  });
}
function table(rows: Row[]) {
  return {
    rows,
    async findFirst({ where }: Row) { const r = rows.find((x) => match(x, where)); return r ? { ...r, user: { name: "Mario Rossi" } } : null; },
    async findUnique({ where }: Row) { return rows.find((x) => x.id === where.id || (where.userId_provider && x.userId === where.userId_provider.userId && x.provider === where.userId_provider.provider)) ?? null; },
    async findUniqueOrThrow({ where }: Row) { const r = rows.find((x) => x.id === where.id); if (!r) throw new Error("nf"); return r; },
    async count({ where }: Row) { return rows.filter((x) => match(x, where)).length; },
    async update({ where, data }: Row) { const r = rows.find((x) => x.id === where.id)!; Object.assign(r, data); return r; },
    async updateMany({ where, data }: Row) { const hit = rows.filter((x) => match(x, where)); hit.forEach((r) => Object.assign(r, data)); return { count: hit.length }; },
  };
}

async function main() {
  // Gmail client stores id + threadId; raw is base64url.
  {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const f = async (url: string, init?: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify({ id: "gm1", threadId: "th1" }), { status: 200 }); };
    const r = await gmailClient("tok", f).send({ from: "mario@gmail.com", fromName: "Mario", to: "jobs@acme.it", subject: "s", text: "t", attachments: [], messageId: "<m@gmail.com>" });
    assert.deepEqual(r, { providerMessageId: "gm1", providerThreadId: "th1", internetMessageId: "<m@gmail.com>" });
    assert.match(JSON.parse(String(calls[0].init?.body)).raw, /^[A-Za-z0-9_-]+$/);
  }

  const now = new Date("2026-10-23T09:00:00Z");
  function setup(opts: { sentToday?: number; scopes?: string; sendResult?: "ok" | "reject" } = {}) {
    const apps = table([{ id: "a1", userId: "u1", status: "ready_to_apply", sendStatus: "not_sent" }]);
    const sends = table([{ id: "s1", applicationId: "a1", userId: "u1", provider: "gmail", fromAddress: "mario@gmail.com", recipient: "jobs@acme.it",
      subject: "Candidatura", bodyText: "Lettera", attachmentsJson: JSON.stringify([{ path: "cv.pdf", filename: "CV.pdf", contentType: "application/pdf" }]),
      state: "approved", sendClaimedAt: null, dryRun: false, providerMessageId: null }]);
    for (let i = 0; i < (opts.sentToday ?? 0); i++) sends.rows.push({ id: `old${i}`, userId: "u1", provider: "gmail", dryRun: false, state: "submitted", sendClaimedAt: new Date(now.getTime() - 3_600_000), providerMessageId: `g${i}` });
    const conns = table([{ id: "c1", userId: "u1", provider: "gmail", status: "active", scopes: opts.scopes ?? "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly", accessTokenEnc: "enc", refreshTokenEnc: null, expiresAt: new Date(now.getTime() + 3_600_000) }]);
    const sent: unknown[] = [];
    const db = { application: apps, mailboxSend: sends, mailboxConnection: conns } as unknown as MailboxDeps["db"];
    const deps: MailboxDeps = {
      db, now: () => now, env: { GMAIL_DAILY_SEND_CAP: "2" }, readFile: async () => pdf, findRecipient: async () => null,
      decrypt: (s) => s, encrypt: (s) => s,
      clientFor: async () => ({ provider: "gmail", async send(m) { sent.push(m); if (opts.sendResult === "reject") { throw new ProviderSendError("rejected", 400, "gmail_send_400"); } return { providerMessageId: "gm-42", providerThreadId: "th-42", internetMessageId: m.messageId }; }, async readThread() { return []; } }),
    };
    return { deps, apps, sends, conns, sent };
  }
  {
    const t = setup();
    assert.equal(await sendApprovedMailbox("s1", "u1", t.deps, { live: true }), "submitted");
    const a = t.apps.rows[0];
    assert.equal(a.status, "success"); assert.equal(a.sendStatus, "submitted");
    assert.equal(a.sentProofType, "gmail_message_id"); assert.equal(a.sentProofRef, "gm-42"); assert.equal(a.sentAt, now);
    assert.equal(t.sends.rows[0].providerThreadId, "th-42");
    assert.equal((t.sent[0] as { fromName: string }).fromName, "Mario Rossi");
  }
  {
    const t = setup({ sentToday: 2 });
    assert.equal(await sendApprovedMailbox("s1", "u1", t.deps, { live: true }), "daily_cap");
    assert.equal(t.sent.length, 0, "cap blocks before provider");
    assert.equal(t.sends.rows[0].sendClaimedAt, null, "claim released for tomorrow");
    assert.equal(t.apps.rows[0].sendStatus, "not_sent");
  }
  {
    const t = setup({ sentToday: 1 });
    assert.equal(await sendApprovedMailbox("s1", "u1", t.deps, { live: true }), "submitted");
  }
  {
    const t = setup({ sendResult: "reject" });
    const errs: unknown[] = []; const orig = console.error; console.error = (...a: unknown[]) => errs.push(a);
    assert.equal(await sendApprovedMailbox("s1", "u1", t.deps, { live: true }), "failed");
    console.error = orig;
    assert.equal(t.apps.rows[0].status, "ready_to_apply");
    assert.equal(t.apps.rows[0].sendStatus, "failed"); assert.equal(t.apps.rows[0].sentProofType, undefined);
    assert.ok(errs.length === 1 && !JSON.stringify(errs).includes("jobs@acme.it"), "logs without recipient");
  }
  {
    const t = setup();
    assert.equal(await sendApprovedMailbox("s1", "u1", t.deps, { live: false, reason: "test_env" }), "dry_run");
    assert.equal(t.apps.rows[0].sendStatus, "not_sent", "dry-run is never proof");
    assert.equal(t.sent.length, 0);
  }
  {
    // Missing gmail.send scope → no client, connection flagged.
    const t = setup({ scopes: "https://www.googleapis.com/auth/gmail.readonly" });
    const warn = console.warn; console.warn = () => void 0;
    const client = await makeClientFor({ db: t.deps.db, decrypt: (s) => s, encrypt: (s) => s, now: () => now })("u1", "gmail");
    console.warn = warn;
    assert.equal(client, null);
    assert.equal(t.conns.rows[0].lastError, "missing_send_scope");
  }
  console.log("proof-of-send + gmail MIME (unit): all tests passed");
}
main().catch((e) => { process.stderr.write(String(e?.stack ?? e) + "\n"); process.exit(1); });
