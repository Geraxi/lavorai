/**
 * Integration test (Postgres locale `lavorai_test`) per l'invio dalla casella.
 * Client Gmail/Graph SEMPRE finti; fetch globale bloccato; rifiuta DB non locali.
 * Run: DATABASE_URL=postgresql://…@localhost:5432/lavorai_test NODE_ENV=test node --import tsx scripts/test-mailbox-sending-postgres.ts
 */
import assert from "node:assert/strict";
globalThis.fetch = (async () => { throw new Error("NETWORK_FORBIDDEN_IN_TESTS"); }) as typeof fetch;
import { PrismaClient } from "@prisma/client";
import { prepareMailboxSends, approveMailboxSends, sendApprovedMailbox, checkMailboxDeliveries, type MailboxDeps } from "../src/lib/mailbox/service";
import { ProviderSendError, type MailboxClient } from "../src/lib/mailbox/providers";
import { deriveApplicationLifecycle } from "../src/lib/application-lifecycle";
import { deliveryEvidence } from "../src/lib/application-evidence";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid");
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/lavorai_test") {
  console.error("Refusing: integration test runs only against localhost/lavorai_test");
  process.exit(1);
}
const db = new PrismaClient();
const RUN = `mbxtest${Date.now().toString(36)}`;
let now = new Date("2026-10-20T08:00:00Z");
const sent: Array<{ to: string; subject: string; attachments: string[] }> = [];
let behaviour: "ok" | "unknown" | "rejected" = "ok";
let thread: "bounce" | "clean" | "unreadable" = "clean";
let clientCalls = 0;
const mockClient: MailboxClient = {
  provider: "gmail",
  async send(m) {
    clientCalls++;
    if (behaviour === "unknown") throw new ProviderSendError("unknown", null, "timeout");
    if (behaviour === "rejected") throw new ProviderSendError("rejected", 400, "bad");
    sent.push({ to: m.to, subject: m.subject, attachments: m.attachments.map((a) => a.filename) });
    return { providerMessageId: `gm-${sent.length}`, providerThreadId: `th-${sent.length}`, internetMessageId: m.messageId };
  },
  async readThread(ref) {
    if (thread === "unreadable") throw new Error("401");
    const ours = { id: ref.providerMessageId, from: "me@gmail.test", subject: "Candidatura", date: now, isOurs: true };
    return thread === "bounce" ? [ours, { id: "dsn", from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>", subject: "Delivery Status Notification (Failure)", date: now }] : [ours];
  },
};
const deps: MailboxDeps = {
  db, now: () => now, env: { NODE_ENV: "test" },
  readFile: async (p) => Buffer.from(`file:${p}`),
  findRecipient: async (job) => (job.company === "NoMail Srl" ? null : { email: "Jobs@Acme.test", provenance: { source: "test" } }),
  clientFor: async () => mockClient,
  decrypt: (s) => s, encrypt: (s) => s,
};
const LIVE = { live: true } as const;

async function main() {
  const user = await db.user.create({ data: { email: `${RUN}@lavorai.test`, name: "Mario Rossi" } });
  const mkApp = async (n: number, company = "Acme Spa") => {
    const job = await db.job.create({ data: { externalId: `${RUN}-${n}`, source: "test", title: `Sviluppatore ${n}`, company, description: "x", url: `https://careers.acme.test/${n}` } });
    return db.application.create({ data: { userId: user.id, jobId: job.id, portal: "email", status: "ready_to_apply", cvPdfPath: `cv/${n}.pdf`, coverLetterText: "Gentile team, ...", coverLetterPath: `cl/${n}.docx` } });
  };
  try {
    const [a1, a2, a3, a4, a5] = [await mkApp(1), await mkApp(2), await mkApp(3), await mkApp(4), await mkApp(5, "NoMail Srl")];

    // Nessuna casella → niente preparazione.
    assert.deepEqual((await prepareMailboxSends(user.id, [a1.id], deps)).skipped, [{ applicationId: a1.id, reason: "no_mailbox" }]);
    await db.mailboxConnection.create({ data: { userId: user.id, provider: "gmail", email: "me@gmail.test", accessTokenEnc: "x", scopes: "gmail.send" } });

    const prep = await prepareMailboxSends(user.id, [a1.id, a2.id, a3.id, a4.id, a5.id, "foreign"], deps);
    assert.equal(prep.prepared.length, 4);
    assert.deepEqual(prep.skipped.map((s) => s.reason).sort(), ["no_verified_recipient", "not_found"]);
    assert.equal(prep.prepared[0].recipient, "jobs@acme.test");
    assert.deepEqual(prep.prepared[0].attachments, ["CV_Mario_Rossi.pdf", "Lettera_Motivazionale_Mario_Rossi.docx"]);
    assert.equal((await prepareMailboxSends(user.id, [a1.id], deps)).skipped[0].reason, "already_prepared");
    const [s1, s2, s3, s4] = prep.prepared.map((p) => p.id);

    // Nessun invio senza approvazione.
    assert.equal(await sendApprovedMailbox(s1, user.id, deps, LIVE), "skipped");
    // Destinatario non confermato → nulla approvato.
    assert.deepEqual(await approveMailboxSends(user.id, [{ id: s1, recipient: "other@acme.test" }], deps), { ok: false, error: "recipient_mismatch" });
    assert.equal((await db.mailboxSend.findUniqueOrThrow({ where: { id: s1 } })).state, "prepared");
    // Altro utente non può approvare.
    assert.equal((await approveMailboxSends("someone-else", [{ id: s1, recipient: "jobs@acme.test" }], deps)).ok, false);
    assert.deepEqual(await approveMailboxSends(user.id, [s1, s2, s3, s4].map((id) => ({ id, recipient: "jobs@acme.test" })), deps), { ok: true, approved: 4 });

    // s1: modalità di default in test = dry-run, il client non viene mai chiamato.
    assert.equal(await sendApprovedMailbox(s1, user.id, deps), "dry_run");
    assert.equal(clientCalls, 0);
    const r1 = await db.mailboxSend.findUniqueOrThrow({ where: { id: s1 } });
    assert.ok(r1.dryRun && r1.providerMessageId?.startsWith("dryrun-") && r1.state === "submitted");
    assert.equal((await db.application.findUniqueOrThrow({ where: { id: a1.id } })).status, "ready_to_apply");

    // s2: invio "live" con client finto → submitted con id; secondo invio impossibile.
    assert.equal(await sendApprovedMailbox(s2, user.id, deps, LIVE), "submitted");
    assert.equal(await sendApprovedMailbox(s2, user.id, deps, LIVE), "skipped");
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0], { to: "jobs@acme.test", subject: "Candidatura: Sviluppatore 2 – Mario Rossi", attachments: ["CV_Mario_Rossi.pdf", "Lettera_Motivazionale_Mario_Rossi.docx"] });
    const app2 = await db.application.findUniqueOrThrow({ where: { id: a2.id }, include: { job: true } });
    assert.equal(app2.submittedVia, "mailbox_gmail");
    assert.equal(app2.submitConfirmation, "MAILBOX_ACCEPTED");
    assert.equal(deriveApplicationLifecycle(app2).status, "submitted_unverified");
    assert.equal(deliveryEvidence(app2), "provider_accepted");

    // s3: esito ambiguo → unverified (mai ritentato). s4: rifiuto esplicito → failed.
    behaviour = "unknown";
    assert.equal(await sendApprovedMailbox(s3, user.id, deps, LIVE), "unverified");
    assert.equal((await db.mailboxSend.findUniqueOrThrow({ where: { id: s3 } })).failureReason, "provider_acceptance_unknown");
    const a6 = await mkApp(6);
    const [p6] = (await prepareMailboxSends(user.id, [a6.id], deps)).prepared;
    await approveMailboxSends(user.id, [{ id: p6.id, recipient: p6.recipient }], deps);
    behaviour = "rejected";
    assert.equal(await sendApprovedMailbox(p6.id, user.id, deps, LIVE), "failed");
    assert.equal((await db.mailboxSend.findUniqueOrThrow({ where: { id: p6.id } })).failureReason, "provider_rejected_400");
    assert.equal((await db.application.findUniqueOrThrow({ where: { id: a6.id } })).status, "ready_to_apply");
    // s4 riceverà il thread con rimbalzo: prima lo inviamo con successo.
    behaviour = "ok";
    assert.equal(await sendApprovedMailbox(s4, user.id, deps, LIVE), "submitted");

    // Controllo rimbalzi entro la finestra: nessuna conferma prematura.
    now = new Date(now.getTime() + 3_600_000);
    let sum = await checkMailboxDeliveries(deps);
    assert.equal(sum.confirmed, 0);
    // s4 rimbalza (thread con mailer-daemon).
    thread = "bounce";
    const onlyS4: MailboxDeps = { ...deps, clientFor: async () => ({ ...mockClient, readThread: async (ref) => ref.providerMessageId === "gm-2" ? mockClient.readThread(ref) : [{ id: ref.providerMessageId, from: "me", subject: "", date: null, isOurs: true }] }) };
    sum = await checkMailboxDeliveries(onlyS4);
    assert.equal(sum.bounced, 1);
    const b4 = await db.mailboxSend.findUniqueOrThrow({ where: { id: s4 } });
    assert.equal(b4.state, "failed");
    assert.match(b4.bounceEvidenceJson ?? "", /mailer-daemon/);
    const app4 = await db.application.findUniqueOrThrow({ where: { id: a4.id }, include: { job: true } });
    assert.equal(app4.submitConfirmation, "MAILBOX_BOUNCED");
    assert.equal(deriveApplicationLifecycle(app4).failureReason, "email_bounced");

    // Dopo 49h senza rimbalzi → delivery_confirmed per s2; il dry-run s1 resta non confermato.
    thread = "clean";
    now = new Date(now.getTime() + 49 * 3_600_000);
    sum = await checkMailboxDeliveries(deps);
    assert.equal(sum.confirmed, 1);
    assert.equal((await db.mailboxSend.findUniqueOrThrow({ where: { id: s2 } })).state, "delivery_confirmed");
    assert.equal((await db.mailboxSend.findUniqueOrThrow({ where: { id: s1 } })).state, "submitted");
    const app2b = await db.application.findUniqueOrThrow({ where: { id: a2.id }, include: { job: true } });
    assert.equal(deriveApplicationLifecycle(app2b).status, "confirmed_submitted");
    assert.equal(deliveryEvidence(app2b), "confirmed_email");

    // Rimbalzo tardivo dopo la conferma: l'evidenza negativa vince.
    thread = "bounce";
    await checkMailboxDeliveries({ ...deps, clientFor: async () => ({ ...mockClient, readThread: async (ref) => mockClient.readThread(ref) }) });
    assert.equal((await db.mailboxSend.findUniqueOrThrow({ where: { id: s2 } })).state, "failed");
    assert.equal(sent.length, 2);
    console.log("mailbox sending (postgres integration): all tests passed");
  } finally {
    await db.mailboxSend.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
    await db.job.deleteMany({ where: { externalId: { startsWith: RUN } } });
    await db.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
