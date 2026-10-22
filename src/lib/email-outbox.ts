import { createHash, randomUUID } from "node:crypto";
import type { CreateEmailOptions } from "resend";
import { prisma } from "@/lib/db";
import { Resend } from "@/lib/resend";
import { emailContext } from "@/lib/email-context";
import { applicationsPaused } from "@/lib/application-pause";
import { EmailDispatchError, EMAIL_LEASE_MS, EMAIL_MAX_ATTEMPTS, EMAIL_RETRY_WINDOW_MS, emailBackoff, essentialEmail } from "@/lib/email-dispatch-policy";
import type { EmailKind } from "@/lib/email-quota";

const pausedKinds = new Set(["cv_ready", "application_sent", "application_manual", "application_no_reply_yet", "daily_summary"]);
const queuedKinds = new Set(["cv_ready", "application_manual", "daily_summary", "payment_failed", "onboarding_nudge", "upgrade_nudge", "weekly_digest", "auto_apply_invite", "trial_started", "trial_granted", "trial_day_3", "trial_day_6", "trial_ended", "trial_ending", "checkout_recovery", "checkout_feedback", "reactivation_blast"]);

/** Admission happens at the existing consent/eligibility-checked call site only.
 * No scanning historical applications, and no executable callbacks are persisted. */
export async function sendQueuedNotification(kind: EmailKind, to: string, buildPayload: () => Promise<CreateEmailOptions>, eventKey?: string, guestCv = false) {
  if (!queuedKinds.has(kind)) throw new Error("unsupported_notification_kind");
  if (pausedKinds.has(kind) && applicationsPaused()) return { sent: false, reason: "applications_paused" };
  const user = await prisma.user.findUnique({ where: { email: to }, select: { id: true, suspendedAt: true } });
  if ((!user && !(guestCv && kind === "cv_ready")) || user?.suspendedAt) return { sent: false, reason: "recipient_unavailable" };
  const payload = await buildPayload();
  if (payload.to !== to || payload.cc || payload.bcc || payload.react || payload.scheduledAt) throw new Error("invalid_notification_payload");
  // Resend accepts base64 attachment contents. Preserve bytes across JSON/restarts.
  const payloadJson = JSON.stringify({ ...payload, attachments: payload.attachments?.map(a => ({ ...a,
    content: Buffer.isBuffer(a.content) ? a.content.toString("base64") : a.content })) });
  const fingerprint = createHash("sha256").update(`${kind}/${to}/${payloadJson}`).digest("hex");
  const now = new Date();
  // Same payload in one UTC day is one intent. An active row also suppresses
  // repeated producers across midnight; completed periodic campaigns may recur.
  const dedupeKey = eventKey ? `${kind}/${user?.id ?? to}/${eventKey}`
    : `${fingerprint}/${essentialEmail(kind) ? "event" : now.toISOString().slice(0, 10)}`;
  const row = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${kind}/${to}`}, 0))::text`;
    // A new calendar bucket must never bypass an unresolved provider outcome.
    // Routine campaigns are fenced per recipient/kind even if rendering changes.
    if (!essentialEmail(kind)) {
      const unresolved = await tx.emailOutbox.findFirst({ where: { kind, to, OR: [
        { status: "review_required" },
        { status: { in: ["pending", "sending"] }, firstAttemptAt: { not: null } },
      ] } });
      if (unresolved) return unresolved;
    }
    const active = await tx.emailOutbox.findFirst({ where: { kind, to, payloadJson, status: { in: ["pending", "sending"] } } });
    return active ?? tx.emailOutbox.upsert({ where: { dedupeKey },
      create: { id: randomUUID(), dedupeKey, kind, to, userId: user?.id,
        payloadJson, priority: essentialEmail(kind) ? 0 : 10, expiresAt: new Date(+now + EMAIL_RETRY_WINDOW_MS) }, update: {} });
  });
  return dispatchEmailNotification(row.id);
}

/** Only a serialized notification is sent. This module cannot submit applications. */
export async function dispatchEmailNotification(id: string, now = new Date()) {
  const row = await prisma.emailOutbox.findUniqueOrThrow({ where: { id } });
  if (row.status === "sent") return { sent: true, reason: null };
  if (!["pending", "sending"].includes(row.status)) return { sent: false, reason: row.status };
  if ((row.leaseUntil && row.leaseUntil > now) || row.nextAttemptAt > now) return { sent: false, reason: "pending" };
  if (row.expiresAt <= now || (row.firstAttemptAt && +now - +row.firstAttemptAt >= EMAIL_RETRY_WINDOW_MS) || row.attempts >= EMAIL_MAX_ATTEMPTS) {
    await prisma.emailOutbox.updateMany({ where: { id, status: row.status, leaseToken: row.leaseToken },
      data: { status: row.firstAttemptAt ? "review_required" : "failed", error: "retry_window_or_attempts_exhausted", leaseToken: null, leaseUntil: null } });
    return { sent: false, reason: "expired" };
  }
  if (!process.env.RESEND_API_KEY || (pausedKinds.has(row.kind) && applicationsPaused())) return { sent: false, reason: "pending" };
  const token = randomUUID();
  const claimed = await prisma.emailOutbox.updateMany({ where: { id, status: row.status, leaseToken: row.leaseToken, attempts: row.attempts,
    OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
    data: { status: "sending", leaseToken: token, leaseUntil: new Date(+now + EMAIL_LEASE_MS), attempts: { increment: 1 }, firstAttemptAt: row.firstAttemptAt ?? now } });
  if (!claimed.count) return { sent: false, reason: "pending" };
  try {
    const user = row.userId ? await prisma.user.findUnique({ where: { id: row.userId }, select: { email: true, suspendedAt: true } }) : null;
    if ((row.userId && (!user || user.email !== row.to || user.suspendedAt)) || (!row.userId && row.kind !== "cv_ready")) throw new EmailDispatchError("recipient_no_longer_eligible", false);
    const dispatchAt = new Date();
    if (dispatchAt >= row.expiresAt || +dispatchAt >= +now + EMAIL_LEASE_MS - 15_000) throw new EmailDispatchError("notification_lease_or_window_expired", false);
    const response = await emailContext.run({ kind: row.kind, to: row.to, deadlineAt: Math.min(+row.expiresAt, +now + EMAIL_LEASE_MS) }, () => new Resend(process.env.RESEND_API_KEY!).emails.send(
      JSON.parse(row.payloadJson) as CreateEmailOptions, { idempotencyKey: `notification/${row.id}` }));
    if (response.error || !response.data?.id) throw new EmailDispatchError("missing_provider_id", true);
    const saved = await prisma.emailOutbox.updateMany({ where: { id, leaseToken: token }, data: {
      status: "sent", providerEmailId: response.data.id, sentAt: new Date(), error: null, leaseToken: null, leaseUntil: null,
    } });
    if (saved.count !== 1) throw new EmailDispatchError("notification_lease_lost", true);
    return { sent: true, reason: null };
  } catch (error) {
    const known = error instanceof EmailDispatchError ? error : null;
    const attempts = row.attempts + (known?.deferred ? 0 : 1);
    const status = known?.reviewRequired ? "review_required" : known && !known.retryable ? "failed" : attempts >= EMAIL_MAX_ATTEMPTS ? "review_required" : "pending";
    await prisma.emailOutbox.updateMany({ where: { id, leaseToken: token }, data: {
      status, attempts, firstAttemptAt: known?.deferred ? row.firstAttemptAt : row.firstAttemptAt ?? now,
      error: known?.message ?? "provider_or_persistence_outcome_unknown", leaseToken: null, leaseUntil: null,
      nextAttemptAt: new Date(+now + (known?.deferred ? 1000 : emailBackoff(attempts))),
    } });
    return { sent: false, reason: status };
  }
}

export async function drainEmailNotifications(limit = 50) {
  // Retain dedupe/status evidence, but discard sensitive rendered bodies/attachments.
  await prisma.emailOutbox.updateMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 24 * 3600_000) },
    status: { in: ["sent", "failed", "review_required"] }, payloadJson: { not: "{}" } }, data: { payloadJson: "{}" } });
  const rows = await prisma.emailOutbox.findMany({ where: { status: { in: ["pending", "sending"] }, nextAttemptAt: { lte: new Date() },
    OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }] },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }], take: Math.min(100, limit) });
  let sent = 0;
  for (const row of rows) {
    const result = await dispatchEmailNotification(row.id);
    if (result.sent) sent++;
    // The global gate, not this sleep, enforces rate across processes.
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return { inspected: rows.length, sent };
}
