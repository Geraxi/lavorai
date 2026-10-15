import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { emailTransaction, nextDeliveryStatus, DELIVERY_EVENT_STATUS } from "@/lib/application-delivery";
import { inboundReplyAddress } from "@/lib/email";
import { applicationsPaused } from "@/lib/application-pause";
import { isApplicationVerificationMessage } from "@/lib/reply-security-message";
import { canReplyToAddress, InboxReplyError, referenceIds, replyMetadata, replySubject, singleMailbox } from "@/lib/inbox-reply-policy";
import { inboundApplicationIds } from "@/lib/application-reply-processing";
import type { InboxReply } from "@prisma/client";

export function publicReply(row: InboxReply) {
  return { id: row.id, parentReplyId: `application_reply:${row.parentReplyId}`, applicationId: row.applicationId,
    bodyText: row.bodyText, recipient: row.recipient, subject: row.subject, status: row.status, failureCode: row.failureCode,
    date: (row.acceptedAt ?? row.createdAt).toISOString(), updatedAt: row.updatedAt.toISOString() };
}

/** Resolve only an owned, direct inbound application message. No caller-supplied addresses. */
export async function getReplyContext(userId: string, sourceId: string) {
  const id = sourceId.startsWith("application_reply:") ? sourceId.slice(18) : null;
  if (!id) throw new InboxReplyError("gmail_read_only", 409);
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new InboxReplyError("message_unavailable", 404);
  let parent = await prisma.applicationReply.findFirst({ where: { id, application: { userId } }, include: { application: { include: { user: { select: { email: true, name: true } } } } } });
  if (!parent || parent.isSecurityCode || isApplicationVerificationMessage(parent)) throw new InboxReplyError("message_unavailable", 404);
  const replyTo = inboundReplyAddress(parent.applicationId);
  if (!replyTo || !process.env.RESEND_API_KEY) throw new InboxReplyError("reply_service_unavailable", 503);
  // Legacy rows lack RFC metadata. Fetch authenticated provider data, not email URLs.
  if (!parent.rfcMessageId || !parent.replyToAddress || !parent.directRecipient) {
    if (parent.provider !== "resend" || !parent.providerMessageId) throw new InboxReplyError("thread_metadata_unavailable", 409);
    const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(parent.providerMessageId)}`, {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new InboxReplyError("thread_metadata_unavailable", 503);
    const data = await response.json();
    const ids = inboundApplicationIds(data.to, process.env.INBOUND_EMAIL_DOMAIN!.trim());
    if (ids.length !== 1 || ids[0] !== parent.applicationId || singleMailbox(data.from) !== singleMailbox(parent.fromAddress)) throw new InboxReplyError("reply_routing_unverified", 409);
    const metadata = replyMetadata(data);
    if (!metadata.rfcMessageId || !metadata.replyToAddress) throw new InboxReplyError("thread_metadata_unavailable", 409);
    parent = await prisma.applicationReply.update({ where: { id: parent.id }, data: { ...metadata, directRecipient: true }, include: { application: { include: { user: { select: { email: true, name: true } } } } } });
  }
  if (!canReplyToAddress(parent.replyToAddress, parent.application.user.email, process.env.INBOUND_EMAIL_DOMAIN!) || ["bounce", "auto"].includes(parent.kind)) throw new InboxReplyError("message_not_replyable", 409);
  const name = (parent.application.user.name ?? "Candidate").replace(/[<>\r\n\0"]/g, " ").slice(0, 100);
  const from = process.env.RESEND_FROM_OVERRIDE ?? "LavorAI <noreply@lavorai.it>";
  const fromEmail = singleMailbox(from);
  if (!fromEmail) throw new InboxReplyError("reply_service_unavailable", 503);
  return { parent, recipient: parent.replyToAddress!, subject: replySubject(parent.subject), replyTo, from: `${name} via LavorAI <${fromEmail}>` };
}

/** Save snapshots before any network write. Client UUID is also the durable idempotency identity. */
export async function saveInboxDraft(userId: string, input: { id: string; parentId: string; body: string }) {
  const existing = await prisma.inboxReply.findFirst({ where: { id: input.id, application: { userId } } });
  if (existing && (existing.parentReplyId !== input.parentId.slice(18) || (existing.status !== "draft" && existing.bodyText !== input.body))) throw new InboxReplyError("reply_already_submitted", 409);
  if (existing?.status !== "draft" && existing) return existing;
  const context = await getReplyContext(userId, input.parentId);
  return emailTransaction(async tx => {
    const row = await tx.inboxReply.findUnique({ where: { id: input.id } });
    if (row) {
      if (row.applicationId !== context.parent.applicationId || row.parentReplyId !== context.parent.id) throw new InboxReplyError("message_unavailable", 404);
      if (row.status !== "draft") {
        if (row.bodyText !== input.body) throw new InboxReplyError("reply_already_submitted", 409);
        return row;
      }
      return tx.inboxReply.update({ where: { id: row.id }, data: { bodyText: input.body } });
    }
    const draftCount = await tx.inboxReply.count({ where: { application: { userId }, status: "draft" } });
    if (draftCount >= 20) throw new InboxReplyError("draft_limit_reached", 429);
    return tx.inboxReply.create({ data: { id: input.id, applicationId: context.parent.applicationId, parentReplyId: context.parent.id,
      bodyText: input.body, recipient: context.recipient, subject: context.subject, fromAddress: context.from,
      replyToAddress: context.replyTo, inReplyTo: context.parent.rfcMessageId!, referencesHeader: referenceIds(context.parent.referencesHeader, context.parent.rfcMessageId!) } });
  });
}

/** Only invoked by an authenticated explicit Send/Retry. No automatic resends. */
export async function sendInboxReply(userId: string, id: string) {
  if (applicationsPaused()) throw new InboxReplyError("sending_paused", 503);
  if (!process.env.RESEND_API_KEY) throw new InboxReplyError("reply_service_unavailable", 503);
  const now = new Date(); const token = randomUUID();
  const claimed = await emailTransaction(async tx => {
    const row = await tx.inboxReply.findFirst({ where: { id, application: { userId } } });
    if (!row) throw new InboxReplyError("message_unavailable", 404);
    if (["accepted", "delivered", "delayed", "bounced", "complained", "failed"].includes(row.status)) return { row, send: false };
    if (row.leaseUntil && row.leaseUntil > now) return { row, send: false };
    if (row.firstAttemptAt && now.getTime() - row.firstAttemptAt.getTime() >= 23 * 3600000) throw new InboxReplyError("send_status_unknown", 409);
    const recent = await tx.inboxReply.count({ where: { application: { userId }, firstAttemptAt: { gte: new Date(now.getTime() - 3600000) }, id: { not: id } } });
    if (recent >= 10) throw new InboxReplyError("reply_rate_limited", 429);
    const day = new Date(now); day.setUTCHours(0,0,0,0);
    const month = new Date(day); month.setUTCDate(1);
    // Reservation and check are serialized; ambiguous attempts still consume capacity.
    const quota = async (start: Date) => (await tx.emailLog.count({ where: { createdAt: { gte: start } } })) + (await tx.inboxReply.count({ where: { firstAttemptAt: { gte: start }, acceptedAt: null, id: { not: id } } }));
    const daily = Number(process.env.RESEND_DAILY_LIMIT) || 95;
    const monthly = Number(process.env.RESEND_MONTHLY_LIMIT) || 2900;
    if (!row.firstAttemptAt && (await quota(day) >= daily || await quota(month) >= monthly)) throw new InboxReplyError("email_quota_reached", 429);
    const updated = await tx.inboxReply.update({ where: { id }, data: { status: "sending", firstAttemptAt: row.firstAttemptAt ?? now, leaseToken: token, leaseUntil: new Date(now.getTime() + 60000), failureCode: null } });
    return { row: updated, send: true };
  });
  if (!claimed.send) return claimed.row;
  const row = claimed.row;
  try {
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: row.fromAddress, to: row.recipient,
      replyTo: row.replyToAddress, subject: row.subject, text: row.bodyText,
      headers: { "In-Reply-To": row.inReplyTo, "References": row.referencesHeader },
      tags: [{ name: "inbox_reply_id", value: row.id }],
    }, { idempotencyKey: `inbox-reply/${row.id}` });
    if (result.error) {
      const quota = /quota|daily|monthly|limit/i.test(result.error.name + " " + result.error.message);
      // Resend responses explicitly reject the request. Draft content is retained.
      const knownRejected = result.error.statusCode != null && result.error.statusCode >= 400 && result.error.statusCode < 500 && result.error.statusCode !== 409;
      await prisma.inboxReply.updateMany({ where: { id, leaseToken: token, status: "sending" }, data: {
        status: knownRejected ? "failed" : "unknown", failureCode: quota ? "email_quota_reached" : knownRejected ? "provider_rejected" : "send_status_unknown", leaseToken: null, leaseUntil: null,
      } });
    } else if (result.data?.id) {
      await emailTransaction(async tx => {
        const current = await tx.inboxReply.findUniqueOrThrow({ where: { id } });
        if (current.providerEmailId && current.providerEmailId !== result.data!.id) throw new Error("reply_provider_conflict");
        // Share accepted usage with the existing platform-wide quota ledger.
        await tx.emailLog.upsert({ where: { id: `inbox-reply:${id}` }, update: {}, create: { id: `inbox-reply:${id}`, kind: "inbox_reply", to: row.recipient } });
        await tx.inboxReply.update({ where: { id }, data: { providerEmailId: result.data!.id, acceptedAt: current.acceptedAt ?? new Date(),
          ...(["sending", "unknown"].includes(current.status) ? { status: "accepted", failureCode: null } : {}), leaseToken: null, leaseUntil: null } });
      });
    } else throw new Error("missing_provider_id");
  } catch {
    await prisma.inboxReply.updateMany({ where: { id, leaseToken: token, status: "sending" }, data: { status: "unknown", failureCode: "send_status_unknown", leaseToken: null, leaseUntil: null } });
  }
  return prisma.inboxReply.findUniqueOrThrow({ where: { id } });
}

/** Called only after Resend signature verification. Tag + exact recipient handles a webhook racing acceptance. */
export async function recordInboxReplyEvent(input: { providerEmailId: string; type: string; occurredAt: Date; replyId?: string; recipients: string[] }) {
  const status = DELIVERY_EVENT_STATUS[input.type];
  if (!status) return false;
  return emailTransaction(async tx => {
    let row = await tx.inboxReply.findUnique({ where: { providerEmailId: input.providerEmailId } });
    if (!row && input.replyId) {
      const candidate = await tx.inboxReply.findUnique({ where: { id: input.replyId } });
      if (candidate?.firstAttemptAt && !candidate.providerEmailId && input.recipients.length === 1 && singleMailbox(input.recipients[0]) === candidate.recipient) row = candidate;
    }
    if (!row) return false;
    const stale = !!row.lastEventAt && row.lastEventAt > input.occurredAt;
    const next = nextDeliveryStatus(row.status, status, stale);
    await tx.emailLog.upsert({ where: { id: `inbox-reply:${row.id}` }, update: {}, create: { id: `inbox-reply:${row.id}`, kind: "inbox_reply", to: row.recipient } });
    await tx.inboxReply.update({ where: { id: row.id }, data: { providerEmailId: input.providerEmailId, status: next,
      acceptedAt: row.acceptedAt ?? input.occurredAt, ...(!stale ? { lastEventAt: input.occurredAt } : {}),
      failureCode: ["failed", "bounced", "complained"].includes(next) ? `provider_${next}` : null } });
    return true;
  });
}
