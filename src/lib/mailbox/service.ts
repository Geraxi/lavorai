/**
 * Invio candidature dalla casella dell'utente: preparazione, approvazione
 * esplicita (con l'elenco dei destinatari), invio una-tantum e verifica dei
 * rimbalzi. Tutte le dipendenze esterne sono iniettabili per i test.
 */
import type { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { resolveSendMode, gmailDailySendCap, romeDayStart, type SendMode } from "./send-guard";
import { newMessageId, assertSafeAddress, type MailAttachment } from "./mime";
import { evaluateDelivery, canTransition, BOUNCE_WINDOW_HOURS } from "./delivery-state";
import { ProviderSendError, gmailClient, graphClient, type MailboxClient, type MailboxProvider } from "./providers";
import { refreshAccessToken, hasSendScope } from "./oauth";
import { notSubmitted, submittedWithProof } from "../proof-of-send";

type Db = Pick<PrismaClient, "application" | "mailboxSend" | "mailboxConnection">;

export interface MailboxDeps {
  db: Db;
  now: () => Date;
  env: Record<string, string | undefined>;
  readFile: (path: string) => Promise<Buffer>;
  /** Destinatario verificato per l'annuncio (provenienza dalla pagina del datore). */
  findRecipient: (job: { url: string; company: string | null; recruiterEmail: string | null; description?: string | null }) => Promise<{ email: string; provenance: unknown } | null>;
  /** Client autenticato per la casella collegata (null se non collegata/valida). */
  clientFor: (userId: string, provider: MailboxProvider) => Promise<MailboxClient | null>;
  decrypt: (s: string) => string;
  encrypt: (s: string) => string;
}

export type PrepareSkip = "not_found" | "no_mailbox" | "no_cv_pdf" | "no_cover_letter" | "no_verified_recipient" | "already_sent" | "already_prepared";

export async function prepareMailboxSends(userId: string, applicationIds: string[], deps: MailboxDeps) {
  const conn = await deps.db.mailboxConnection.findFirst({ where: { userId, status: "active" }, orderBy: { updatedAt: "desc" } });
  const prepared: Array<{ id: string; applicationId: string; recipient: string; subject: string; attachments: string[] }> = [];
  const skipped: Array<{ applicationId: string; reason: PrepareSkip }> = [];
  for (const applicationId of [...new Set(applicationIds)].slice(0, 100)) {
    const app = await deps.db.application.findFirst({
      where: { id: applicationId, userId },
      select: { id: true, status: true, cvPdfPath: true, coverLetterPath: true, coverLetterText: true, cvLanguage: true,
        user: { select: { name: true, email: true } },
        job: { select: { title: true, company: true, url: true, recruiterEmail: true, description: true } },
        mailboxSends: { where: { state: { not: "failed" } }, select: { id: true, state: true } } },
    });
    if (!app) { skipped.push({ applicationId, reason: "not_found" }); continue; }
    if (!conn) { skipped.push({ applicationId, reason: "no_mailbox" }); continue; }
    if (app.mailboxSends.some((s) => s.state !== "prepared")) { skipped.push({ applicationId, reason: "already_sent" }); continue; }
    if (app.mailboxSends.length) { skipped.push({ applicationId, reason: "already_prepared" }); continue; }
    if (app.status === "success") { skipped.push({ applicationId, reason: "already_sent" }); continue; }
    if (!app.cvPdfPath) { skipped.push({ applicationId, reason: "no_cv_pdf" }); continue; }
    if (!app.coverLetterText?.trim()) { skipped.push({ applicationId, reason: "no_cover_letter" }); continue; }
    const found = await deps.findRecipient({ url: app.job.url, company: app.job.company, recruiterEmail: app.job.recruiterEmail, description: app.job.description }).catch(() => null);
    if (!found) { skipped.push({ applicationId, reason: "no_verified_recipient" }); continue; }
    const recipient = found.email.trim().toLowerCase();
    try { assertSafeAddress(recipient); } catch { skipped.push({ applicationId, reason: "no_verified_recipient" }); continue; }
    const en = app.cvLanguage === "en";
    const name = app.user.name?.trim() || app.user.email;
    const subject = en ? `Application: ${app.job.title} – ${name}` : `Candidatura: ${app.job.title} – ${name}`;
    const slug = name.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 40) || "candidato";
    const attachments = [{ path: app.cvPdfPath, filename: `CV_${slug}.pdf`, contentType: "application/pdf" }];
    if (app.coverLetterPath) attachments.push({ path: app.coverLetterPath, filename: `${en ? "Cover_Letter" : "Lettera_Motivazionale"}_${slug}.docx`, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const row = await deps.db.mailboxSend.create({ data: {
      applicationId, userId, provider: conn.provider, fromAddress: conn.email, recipient,
      recipientProvenanceJson: JSON.stringify(found.provenance ?? null).slice(0, 2000),
      subject, bodyText: app.coverLetterText.trim(), attachmentsJson: JSON.stringify(attachments), state: "prepared",
    } });
    prepared.push({ id: row.id, applicationId, recipient, subject, attachments: attachments.map((a) => a.filename) });
  }
  return { prepared, skipped };
}

/**
 * Approvazione esplicita. `confirmed` deve elencare ESATTAMENTE ogni coppia
 * invio→destinatario mostrata all'utente: se un destinatario non coincide,
 * nulla viene approvato (fail closed).
 */
export async function approveMailboxSends(userId: string, confirmed: Array<{ id: string; recipient: string }>, deps: MailboxDeps) {
  if (confirmed.length === 0 || confirmed.length > 100) return { ok: false as const, error: "invalid_batch" };
  const rows = await deps.db.mailboxSend.findMany({ where: { id: { in: confirmed.map((c) => c.id) }, userId, state: "prepared" } });
  if (rows.length !== confirmed.length) return { ok: false as const, error: "stale_or_foreign" };
  for (const c of confirmed) {
    const row = rows.find((r) => r.id === c.id);
    if (!row || row.recipient !== c.recipient.trim().toLowerCase()) return { ok: false as const, error: "recipient_mismatch" };
  }
  const now = deps.now();
  const res = await deps.db.mailboxSend.updateMany({ where: { id: { in: rows.map((r) => r.id) }, userId, state: "prepared" }, data: { state: "approved", approvedAt: now } });
  return { ok: true as const, approved: res.count };
}

export type SendOutcome = "submitted" | "dry_run" | "failed" | "unverified" | "skipped" | "daily_cap";

/** Invia UNA volta un invio approvato. Mai ritentato automaticamente. */
export async function sendApprovedMailbox(sendId: string, userId: string, deps: MailboxDeps, mode: SendMode = resolveSendMode(deps.env)): Promise<SendOutcome> {
  const now = deps.now();
  // Claim atomico: un solo processo può attraversare il confine del provider.
  const claim = await deps.db.mailboxSend.updateMany({ where: { id: sendId, userId, state: "approved", sendClaimedAt: null }, data: { sendClaimedAt: now } });
  if (claim.count !== 1) return "skipped";
  const row = await deps.db.mailboxSend.findUniqueOrThrow({ where: { id: sendId } });

  if (mode.live && row.provider === "gmail") {
    // Per-user daily cap on REAL Gmail sends (Europe/Rome day). Counts every
    // live send that may have crossed the provider boundary today, including
    // concurrent in-flight claims; on overflow the claim is released untouched
    // so the approved send can go out tomorrow. Conservative under races.
    const cap = gmailDailySendCap(deps.env);
    const today = await deps.db.mailboxSend.count({ where: {
      userId, provider: "gmail", dryRun: false, id: { not: sendId }, sendClaimedAt: { gte: romeDayStart(now) },
      OR: [{ providerMessageId: { not: null } }, { state: { in: ["approved", "unverified"] } }],
    } });
    if (today >= cap) {
      await deps.db.mailboxSend.updateMany({ where: { id: sendId, userId, state: "approved", sendClaimedAt: now }, data: { sendClaimedAt: null, failureReason: "daily_cap_reached" } });
      console.warn(`[mailbox] send ${sendId} deferred: daily gmail cap ${cap} reached`);
      return "daily_cap";
    }
  }

  if (!mode.live) {
    // Sink locale: nessuna rete. Registrato come simulazione, mai come consegna.
    await deps.db.mailboxSend.update({ where: { id: sendId }, data: {
      state: "submitted", dryRun: true, submittedAt: now, providerMessageId: `dryrun-${randomBytes(6).toString("hex")}`,
      providerThreadId: null, failureReason: `dry_run:${mode.reason}`,
    } });
    return "dry_run";
  }

  const client = await deps.clientFor(userId, row.provider as MailboxProvider);
  if (!client) {
    await deps.db.mailboxSend.update({ where: { id: sendId }, data: { state: "failed", failedAt: now, failureReason: "mailbox_not_connected" } });
    await deps.db.application.updateMany({ where: { id: row.applicationId, userId, status: { not: "success" } }, data: notSubmitted("failed", "mailbox_not_connected") }).catch(() => void 0);
    return "failed";
  }
  let attachments: MailAttachment[];
  try {
    const list = JSON.parse(row.attachmentsJson) as Array<{ path: string; filename: string; contentType: string }>;
    attachments = await Promise.all(list.map(async (a) => ({ filename: a.filename, contentType: a.contentType, content: await deps.readFile(a.path) })));
  } catch {
    await deps.db.mailboxSend.update({ where: { id: sendId }, data: { state: "failed", failedAt: now, failureReason: "attachments_unavailable" } });
    return "failed";
  }
  const domain = row.fromAddress.split("@")[1] || "lavorai.it";
  const owner = await deps.db.application.findFirst({ where: { id: row.applicationId, userId }, select: { user: { select: { name: true } } } }).catch(() => null);
  try {
    const r = await client.send({ from: row.fromAddress, fromName: owner?.user.name ?? null, to: row.recipient, subject: row.subject, text: row.bodyText, attachments, messageId: newMessageId(domain) });
    await deps.db.mailboxSend.update({ where: { id: sendId }, data: {
      state: "submitted", submittedAt: now, providerMessageId: r.providerMessageId, providerThreadId: r.providerThreadId, internetMessageId: r.internetMessageId,
    } });
    // Proof-of-send: the provider's returned message id IS the proof.
    await deps.db.application.updateMany({ where: { id: row.applicationId, userId, status: { not: "success" } }, data: {
      status: "success", submittedVia: `mailbox_${row.provider}`, submitConfirmation: "MAILBOX_ACCEPTED", submittedAt: now, completedAt: now, errorMessage: null,
      ...submittedWithProof({ type: row.provider === "gmail" ? "gmail_message_id" : "email_provider_message_id", ref: r.providerMessageId }, now),
    } });
    return "submitted";
  } catch (e) {
    const kind = e instanceof ProviderSendError ? e.kind : "unknown";
    // Never log tokens, bodies or recipients: id + provider + classification only.
    console.error(`[mailbox] send ${sendId} ${row.provider} failed kind=${kind} status=${e instanceof ProviderSendError ? e.status ?? "none" : "none"} msg=${e instanceof Error ? e.message.slice(0, 80) : "unknown"}`);
    if (kind === "auth") await deps.db.mailboxConnection.updateMany({ where: { userId, provider: row.provider }, data: { status: "error", lastError: "auth_failed" } });
    const failed = kind === "rejected" || kind === "auth";
    await deps.db.mailboxSend.update({ where: { id: sendId }, data: failed
      ? { state: "failed", failedAt: now, failureReason: kind === "auth" ? "mailbox_auth_failed" : `provider_rejected${e instanceof ProviderSendError && e.status ? `_${e.status}` : ""}` }
      : { state: "unverified", failureReason: "provider_acceptance_unknown" } });
    await deps.db.application.updateMany({ where: { id: row.applicationId, userId, status: { not: "success" } }, data: failed
      ? notSubmitted("failed", kind === "auth" ? "mailbox_auth_failed" : "mailbox_provider_rejected")
      : notSubmitted("needs_user", "mailbox_acceptance_unknown") }).catch(() => void 0);
    return failed ? "failed" : "unverified";
  }
}

/** Controllo periodico dei rimbalzi (cron). Solo invii reali, mai i dry-run. */
export async function checkMailboxDeliveries(deps: MailboxDeps, limit = 200) {
  const now = deps.now();
  const horizon = new Date(now.getTime() - 7 * 86_400_000);
  const rows = await deps.db.mailboxSend.findMany({
    where: { dryRun: false, providerMessageId: { not: null }, submittedAt: { gte: horizon }, state: { in: ["submitted", "delivery_confirmed"] } },
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } }, take: limit,
  });
  const summary = { checked: 0, confirmed: 0, bounced: 0, unverified: 0 };
  for (const row of rows) {
    const client = await deps.clientFor(row.userId, row.provider as MailboxProvider).catch(() => null);
    let thread = null;
    if (client) thread = await client.readThread({ providerMessageId: row.providerMessageId!, providerThreadId: row.providerThreadId, internetMessageId: row.internetMessageId }).catch(() => null);
    const successfulChecks = row.checkCount + (thread ? 1 : 0);
    const v = evaluateDelivery({ submittedAt: row.submittedAt!, now, thread, successfulChecks, windowHours: Number(deps.env.MAILBOX_BOUNCE_WINDOW_HOURS) || BOUNCE_WINDOW_HOURS });
    summary.checked++;
    const base = { lastCheckedAt: now, checkCount: successfulChecks };
    if (v.state === "failed" && canTransition(row.state, "failed")) {
      summary.bounced++;
      await deps.db.mailboxSend.update({ where: { id: row.id }, data: { ...base, state: "failed", failedAt: now, failureReason: "bounced", bounceEvidenceJson: JSON.stringify(v.evidence) } });
      await deps.db.application.updateMany({ where: { id: row.applicationId, submittedVia: `mailbox_${row.provider}` }, data: { submitConfirmation: "MAILBOX_BOUNCED", errorMessage: "Email rimbalzata: il destinatario non l'ha ricevuta.", ...notSubmitted("failed", "bounced") } });
    } else if (v.state === "delivery_confirmed" && row.state === "submitted") {
      summary.confirmed++;
      await deps.db.mailboxSend.update({ where: { id: row.id }, data: { ...base, state: "delivery_confirmed", confirmedAt: now } });
      await deps.db.application.updateMany({ where: { id: row.applicationId, submittedVia: `mailbox_${row.provider}` }, data: { submitConfirmation: "MAILBOX_NO_BOUNCE" } });
    } else if (v.state === "unverified" && row.state === "submitted") {
      summary.unverified++;
      await deps.db.mailboxSend.update({ where: { id: row.id }, data: { ...base, state: "unverified", failureReason: v.reason } });
    } else {
      await deps.db.mailboxSend.update({ where: { id: row.id }, data: base });
    }
  }
  return summary;
}

/** Client reale da token cifrato, con refresh. Usato da route e cron. */
export function makeClientFor(deps: Pick<MailboxDeps, "db" | "decrypt" | "encrypt" | "now">) {
  return async (userId: string, provider: MailboxProvider): Promise<MailboxClient | null> => {
    const c = await deps.db.mailboxConnection.findUnique({ where: { userId_provider: { userId, provider } } });
    if (!c || c.status !== "active") return null;
    // gmail.send must actually be granted (granular consent can drop it).
    if (!hasSendScope(provider, c.scopes)) {
      await deps.db.mailboxConnection.update({ where: { id: c.id }, data: { status: "error", lastError: "missing_send_scope" } });
      console.warn(`[mailbox] ${provider} connection ${c.id} lacks send scope`);
      return null;
    }
    let token = deps.decrypt(c.accessTokenEnc);
    if (!c.expiresAt || c.expiresAt.getTime() < deps.now().getTime() + 60_000) {
      if (!c.refreshTokenEnc) return null;
      try {
        const t = await refreshAccessToken(provider, deps.decrypt(c.refreshTokenEnc));
        token = t.accessToken;
        await deps.db.mailboxConnection.update({ where: { id: c.id }, data: { accessTokenEnc: deps.encrypt(t.accessToken), expiresAt: t.expiresAt, ...(t.refreshToken ? { refreshTokenEnc: deps.encrypt(t.refreshToken) } : {}) } });
      } catch (e) {
        // 400/401 (invalid_grant: revoked/expired refresh token) needs a reconnect;
        // network/5xx is transient: keep the connection active and retry later.
        const msg = e instanceof Error ? e.message : "unknown";
        const permanent = /^token_(400|401)$/.test(msg) || msg === "token_missing";
        console.error(`[mailbox] ${provider} token refresh failed (${msg})${permanent ? " → reconnect required" : " → transient"}`);
        if (permanent) await deps.db.mailboxConnection.update({ where: { id: c.id }, data: { status: "error", lastError: "refresh_failed" } });
        return null;
      }
    }
    return provider === "gmail" ? gmailClient(token) : graphClient(token);
  };
}
