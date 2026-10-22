import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { Resend } from "resend";
import { sendWithinQuota } from "@/lib/email-quota";
import { applicationsPaused } from "@/lib/application-pause";
import { parseVerifiedSubmissionReceipt, receiptJobId } from "@/lib/submission-receipt";

const notificationEvidenceSelect = {
  id: true, status: true, submittedAt: true, sentNotificationRequiredAt: true, submittedVia: true, submissionReceiptJson: true,
  job: { select: { url: true } }, user: { select: { email: true } },
  emailAttempts: { select: { status: true, providerEmailId: true } },
} as const;
type NotificationEvidence = { status: string; sentNotificationRequiredAt: Date | null; submittedAt: Date | null; submittedVia: string | null;
  submissionReceiptJson: string | null; job: { url: string };
  emailAttempts: Array<{ status: string; providerEmailId: string | null }> };
export function hasNotificationEvidence(app: NotificationEvidence): boolean {
  if (app.status !== "success" || !app.submittedAt || !app.sentNotificationRequiredAt) return false;
  const receipt = parseVerifiedSubmissionReceipt(app.submissionReceiptJson, app.submittedVia);
  return !!(receipt && receipt.jobId === receiptJobId(receipt.provider, app.job.url))
    || (app.submittedVia === "email_recruiter" && app.emailAttempts.some(attempt =>
      !!attempt.providerEmailId && ["accepted", "delivered", "delayed"].includes(attempt.status)));
}

type Payload = { from: string; to: string; subject: string; html: string; text: string };
const LEASE_MS = 5 * 60_000;
// Resend idempotency keys expire after 24h; ambiguity must not cause late replay.
const RETRY_WINDOW_MS = 23 * 60 * 60_000;

/** Called only for a confirmed send. Persist a stable notification, not a new application. */
export async function queueApplicationSentNotification(applicationId: string, payload: Payload) {
  const app = await prisma.application.findUnique({ where: { id: applicationId }, select: notificationEvidenceSelect });
  if (!app || !hasNotificationEvidence(app) || payload.to !== app.user.email) return;
  await prisma.applicationSentNotification.upsert({ where: { applicationId },
    create: { applicationId, payloadJson: JSON.stringify(payload) }, update: {} });
  return retryApplicationSentNotification(applicationId);
}

/** Explicit retry entrypoint: reads the stored payload; never invokes a worker,
 * queue, ATS, or recruiter send. Legacy successes without evidence are never admitted. */
export async function retryApplicationSentNotification(applicationId: string, now = new Date()) {
  if (applicationsPaused() || !process.env.RESEND_API_KEY) return false;
  const row = await prisma.applicationSentNotification.findUnique({ where: { applicationId } });
  if (!row || row.sentAt || !["pending", "sending"].includes(row.status) || (row.leaseUntil && row.leaseUntil > now)) return false;
  if (row.firstAttemptAt && +now - +row.firstAttemptAt >= RETRY_WINDOW_MS) {
    await prisma.applicationSentNotification.updateMany({ where: { applicationId, sentAt: null },
      data: { status: "review_required", error: "notification_idempotency_window_expired", leaseToken: null, leaseUntil: null } });
    return false;
  }
  const token = randomUUID();
  const claimed = await prisma.applicationSentNotification.updateMany({ where: {
    applicationId, sentAt: null, status: row.status, firstAttemptAt: row.firstAttemptAt,
    OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
  }, data: { leaseToken: token, leaseUntil: new Date(+now + LEASE_MS), status: "sending" } });
  if (claimed.count !== 1) return false;
  try {
    const payload = JSON.parse(row.payloadJson) as Payload;
    const result = await sendWithinQuota("application_sent", payload.to, async () => {
      // Quota/database waits can outlive the lease or provider replay window.
      // Recheck at dispatch, not just when starting the retry.
      const dispatchAt = new Date();
      if (row.firstAttemptAt && +dispatchAt - +row.firstAttemptAt >= RETRY_WINDOW_MS) {
        await prisma.applicationSentNotification.updateMany({ where: { applicationId, leaseToken: token, sentAt: null },
          data: { status: "review_required", error: "notification_idempotency_window_expired", leaseToken: null, leaseUntil: null } });
        throw new Error("notification_idempotency_window_expired");
      }
      const marked = await prisma.applicationSentNotification.updateMany({ where: {
        applicationId, leaseToken: token, status: "sending", sentAt: null, leaseUntil: { gt: dispatchAt },
      }, data: { firstAttemptAt: row.firstAttemptAt ?? dispatchAt } });
      if (marked.count !== 1) throw new Error("notification_lease_lost");
      const response = await new Resend(process.env.RESEND_API_KEY!).emails.send(payload,
        { idempotencyKey: `application-sent/${applicationId}` });
      if (response.error || !response.data?.id) throw new Error("notification_provider_rejected");
      const saved = await prisma.applicationSentNotification.updateMany({ where: { applicationId, leaseToken: token },
        data: { status: "sent", sentAt: now, providerEmailId: response.data.id, error: null, leaseUntil: null, leaseToken: null } });
      if (saved.count !== 1) throw new Error("notification_lease_lost");
    });
    if (!result.sent) throw new Error(result.reason ?? "notification_not_sent");
    return true;
  } catch {
    await prisma.applicationSentNotification.updateMany({ where: { applicationId, leaseToken: token },
      data: { status: "pending", error: "notification_send_failed", leaseUntil: null, leaseToken: null } });
    return false;
  }
}

/** Repairs the receipt->notification crash gap. Only durable, job-bound proof
 * admits creation; the normal notifier rechecks evidence and keeps its cooldown.
 * Dispatches pending outbox rows separately. Never calls processApplication or
 * enqueues a candidate. Stable keys protect concurrent cron/worker execution. */
export async function reconcileApplicationSentNotifications(
  notify: (id: string) => Promise<void> = async id => {
    const { notifyApplicationSent } = await import("@/lib/application-worker");
    await notifyApplicationSent(id);
  },
) {
  if (applicationsPaused() || !process.env.RESEND_API_KEY) return { inspected: 0, retried: 0 };
  let afterId: string | undefined;
  let inspected = 0;
  while (inspected < 50) {
    const apps = await prisma.application.findMany({ where: {
      status: "success", submittedAt: { not: null }, sentNotificationRequiredAt: { not: null }, sentNotification: { is: null },
      ...(afterId ? { id: { gt: afterId } } : {}),
      OR: [{ submissionReceiptJson: { not: null } }, { submittedVia: "email_recruiter", emailAttempts: {
        some: { providerEmailId: { not: null }, status: { in: ["accepted", "delivered", "delayed"] } },
      } }],
    }, select: notificationEvidenceSelect, take: 50, orderBy: { id: "asc" } });
    if (!apps.length) break;
    afterId = apps[apps.length - 1].id;
    for (const app of apps) {
      if (!hasNotificationEvidence(app)) continue;
      inspected++;
      await notify(app.id).catch(() => void 0); // Stored proof remains available next run.
      if (inspected >= 50) break;
    }
  }
  let retried = 0;
  const pending = await prisma.applicationSentNotification.findMany({ where: {
    sentAt: null, status: { in: ["pending", "sending"] },
    OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }],
  }, select: { applicationId: true }, take: 50, orderBy: { createdAt: "asc" } });
  for (const row of pending) {
    if (await retryApplicationSentNotification(row.applicationId).catch(() => false)) retried++;
  }
  return { inspected, retried };
}
