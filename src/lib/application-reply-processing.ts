import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { forwardReplyToUser } from "@/lib/email";
import { classifyReply } from "@/lib/reply-parser";
import { isApplicationVerificationMessage } from "@/lib/reply-security-message";
import { applyReplyToApplication } from "@/lib/apply-reply-to-application";
import { emailTransaction } from "@/lib/application-delivery";

export interface InboundEmail {
  email_id: string;
  to?: string[] | string;
  from?: string;
  subject?: string;
  text?: string | null;
  html?: string | null;
}
type ForwardPayload = Parameters<typeof forwardReplyToUser>[0];
const MAX_BODY = 8000;
const FORWARD_LEASE_MS = 60_000;
// Resend expires idempotency keys at 24h. Stop with a conservative margin.
const FORWARD_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

export function htmlToReplyText(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>(?=)/gi, "\n").replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** Route only aliases at OUR receiving domain, across every recipient. */
export function inboundApplicationIds(to: InboundEmail["to"], domain: string): string[] {
  if (!domain || !/^[a-z0-9.-]+$/i.test(domain)) return [];
  const recipients = (Array.isArray(to) ? to : [to ?? ""]).flatMap((x) => x.split(","));
  const ids = recipients.flatMap((value) => {
    const address = value.trim().match(/^(?:[^<>]*<)?(reply\+([a-z0-9_-]+)@([^<>\s]+))>?$/i);
    return address && address[3].toLowerCase() === domain.toLowerCase() ? [address[2]] : [];
  });
  return [...new Set(ids)];
}

export async function hydrateInboundEmail(data: InboundEmail): Promise<InboundEmail> {
  if (data.text?.trim() || data.html?.trim()) return data;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("inbound_body_credentials_unavailable");
  const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(data.email_id)}`, {
    headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000), cache: "no-store",
  });
  if (!response.ok) throw new Error("inbound_body_unavailable");
  const full = await response.json() as Partial<InboundEmail>;
  if (!full || typeof full !== "object" || !("text" in full || "html" in full)) throw new Error("inbound_body_invalid");
  return { ...data, text: full.text, html: full.html, to: data.to ?? full.to, from: data.from ?? full.from, subject: data.subject ?? full.subject };
}

async function matchForwardedReply(data: InboundEmail): Promise<{ appId: string; recruiterFrom: string | null } | null> {
  const senderEmail = data.from?.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0]?.toLowerCase();
  if (!senderEmail) return null;
  const user = await prisma.user.findFirst({ where: { email: { equals: senderEmail, mode: "insensitive" } }, select: { id: true } });
  if (!user) return null;
  const raw = data.text?.trim() ? data.text : htmlToReplyText(data.html ?? "");
  const text = `${data.subject ?? ""}\n${raw}`.toLowerCase();
  const fromLine = raw.match(/^\s*(?:from|da|de|von)\s*:\s*(.+)$/im)?.[1]?.trim() ?? null;
  const recruiterFrom = fromLine && /@/.test(fromLine) ? fromLine.slice(0, 320) : null;
  const apps = await prisma.application.findMany({
    where: { userId: user.id, OR: [{ status: "success" }, { submittedAt: { not: null } }] },
    orderBy: { createdAt: "desc" }, take: 200,
    select: { id: true, job: { select: { company: true, title: true } } },
  });
  const matches = apps.map((app) => {
    const company = app.job.company?.toLowerCase().trim() ?? "";
    const title = app.job.title.toLowerCase().trim();
    const score = (company.length >= 3 && text.includes(company) ? 3 : 0) + (title.length >= 6 && text.includes(title) ? 2 : 0);
    return { id: app.id, score };
  }).filter((app) => app.score >= 3).sort((a, b) => b.score - a.score);
  // Never attach an ambiguous forwarded message to whichever job is newest.
  if (!matches[0] || matches[0].score === matches[1]?.score) return null;
  return { appId: matches[0].id, recruiterFrom };
}

export async function processInboundReply(input: {
  data: InboundEmail;
  providerEventId: string;
  receivedAt: Date;
}): Promise<{ matched: boolean; replyId?: string }> {
  const identity = { provider: "resend", providerMessageId: input.data.email_id };
  const existing = await prisma.applicationReply.findUnique({ where: { provider_providerMessageId: identity }, select: { id: true } });
  if (existing) {
    await forwardStoredReply(existing.id);
    return { matched: true, replyId: existing.id };
  }
  // Receiving webhooks are metadata-only. Fetch BEFORE matching forwarded mail.
  const data = await hydrateInboundEmail(input.data);
  const domain = process.env.INBOUND_EMAIL_DOMAIN?.trim();
  if (!domain) throw new Error("inbound_domain_unconfigured");
  const appIds = inboundApplicationIds(data.to, domain);
  if (appIds.length > 1) throw new Error("ambiguous_inbound_recipient");
  let appId = appIds[0];
  let forwardedFrom: string | null = null;
  if (!appId) {
    // A catch-all on the receiving domain supports deliberate user forwarding.
    // No arbitrary external-domain alias may attach a message to an application.
    const recipients = Array.isArray(data.to) ? data.to : [data.to ?? ""];
    if (!recipients.some((to) => to.toLowerCase().match(/@([^\s>,]+)/)?.[1] === domain.toLowerCase())) return { matched: false };
    const match = await matchForwardedReply(data);
    if (!match) return { matched: false };
    appId = match.appId;
    forwardedFrom = match.recruiterFrom;
  }
  const app = await prisma.application.findUnique({ where: { id: appId }, select: {
    id: true, user: { select: { email: true } }, job: { select: { title: true, company: true } },
  } });
  if (!app) return { matched: false };
  const fromAddress = (forwardedFrom ?? data.from ?? "sconosciuto").slice(0, 320);
  const subject = data.subject?.replace(/^\s*(fwd?|i|tr|wg)\s*:\s*/i, "").slice(0, 500) || null;
  const bodyText = (data.text?.trim() ? data.text : htmlToReplyText(data.html ?? "")).slice(0, MAX_BODY) || null;
  const isSecurityCode = isApplicationVerificationMessage({ fromAddress, subject, bodyText });
  const classification = isSecurityCode || !bodyText ? { kind: "auto" as const, isHuman: false } : classifyReply({ fromAddress, subject, bodyText });
  const forwardPayload: ForwardPayload = { userEmail: app.user.email, recruiterFrom: fromAddress,
    jobTitle: app.job.title, company: app.job.company, subject, bodyText, kind: classification.kind };
  const reply = await emailTransaction(async (tx) => {
    const duplicate = await tx.applicationReply.findUnique({ where: { provider_providerMessageId: identity } });
    if (duplicate) return duplicate;
    const row = await tx.applicationReply.create({ data: {
      ...identity, providerEventId: input.providerEventId, applicationId: app.id,
      fromAddress, subject, bodyText, ...classification, isSecurityCode, receivedAt: input.receivedAt,
      forwardStatus: isSecurityCode ? "skipped" : "pending",
      forwardIdempotencyKey: isSecurityCode ? null : `reply-forward/${randomUUID()}`,
      forwardPayloadJson: isSecurityCode ? null : JSON.stringify(forwardPayload),
      processingAppliedAt: new Date(),
    } });
    if (!isSecurityCode) await applyReplyToApplication({ applicationId: app.id, ...classification, receivedAt: input.receivedAt }, tx);
    return row;
  });
  await forwardStoredReply(reply.id);
  return { matched: true, replyId: reply.id };
}

/** Atomic outbox lease + stable payload/key make webhook retries safe.
 * Never put the network call in the transaction. Crash after send is recovered
 * with the same provider idempotency key, only during its guaranteed window.
 */
export async function forwardStoredReply(replyId: string): Promise<"sent" | "skipped" | "unknown"> {
  const now = new Date();
  const leaseToken = randomUUID();
  const claim = await emailTransaction(async (tx) => {
    const row = await tx.applicationReply.findUniqueOrThrow({ where: { id: replyId } });
    if (["sent", "skipped", "unknown"].includes(row.forwardStatus)) return { kind: "done" as const, outcome: row.forwardStatus as "sent" | "skipped" | "unknown" };
    if (row.forwardStartedAt && now.getTime() - row.forwardStartedAt.getTime() >= FORWARD_RETRY_WINDOW_MS) {
      await tx.applicationReply.update({ where: { id: replyId }, data: { forwardStatus: "unknown", forwardError: "idempotency_window_expired", forwardLeaseUntil: null, forwardLeaseToken: null } });
      return { kind: "done" as const, outcome: "unknown" as const };
    }
    if (row.forwardLeaseUntil && row.forwardLeaseUntil > now) throw new Error("reply_forward_in_progress");
    if (!row.forwardPayloadJson || !row.forwardIdempotencyKey) throw new Error("reply_forward_payload_missing");
    await tx.applicationReply.update({ where: { id: replyId }, data: { forwardStatus: "sending", forwardStartedAt: row.forwardStartedAt ?? now,
      forwardLeaseUntil: new Date(now.getTime() + FORWARD_LEASE_MS), forwardLeaseToken: leaseToken, forwardError: null } });
    return { kind: "send" as const, payload: JSON.parse(row.forwardPayloadJson) as ForwardPayload, key: row.forwardIdempotencyKey };
  });
  if (claim.kind === "done") return claim.outcome;
  try {
    const providerId = await forwardReplyToUser(claim.payload, { idempotencyKey: claim.key });
    if (!providerId) throw new Error("reply_forward_missing_provider_id");
    const saved = await prisma.applicationReply.updateMany({ where: { id: replyId, forwardLeaseToken: leaseToken }, data: {
      forwardStatus: "sent", forwardedAt: new Date(), forwardProviderId: providerId,
      forwardLeaseUntil: null, forwardLeaseToken: null, forwardError: null,
    } });
    if (saved.count !== 1) throw new Error("reply_forward_lease_lost");
    return "sent";
  } catch {
    // No message bodies, addresses, provider responses or credentials in errors.
    await prisma.applicationReply.updateMany({ where: { id: replyId, forwardLeaseToken: leaseToken }, data: {
      forwardStatus: "failed", forwardError: "provider_forward_failed_or_acceptance_unknown", forwardLeaseUntil: null, forwardLeaseToken: null,
    } });
    throw new Error("reply_forward_retry_required");
  }
}

/** Existing authenticated cron can drain durable notifications after an outage. */
export async function retryPendingReplyForwards(limit = 20): Promise<{ completed: number; failed: number; needsReview: number }> {
  const rows = await prisma.applicationReply.findMany({ where: {
    forwardStatus: { in: ["pending", "failed", "sending"] },
    OR: [{ forwardLeaseUntil: null }, { forwardLeaseUntil: { lte: new Date() } }],
  }, orderBy: { receivedAt: "asc" }, take: Math.max(1, Math.min(100, limit)), select: { id: true } });
  let completed = 0; let failed = 0; let needsReview = 0;
  for (const row of rows) {
    try {
      const outcome = await forwardStoredReply(row.id);
      if (outcome === "unknown") needsReview++; else if (outcome === "sent") completed++;
    } catch { failed++; }
  }
  return { completed, failed, needsReview };
}
