import type { Prisma, ApplicationEmailAttempt } from "@prisma/client";
import { prisma } from "@/lib/db";

export type DeliveryStatus = "sending" | "accepted" | "delivered" | "delayed" | "bounced" | "failed" | "complained" | "unknown";
export const DELIVERY_EVENT_STATUS: Record<string, DeliveryStatus> = {
  "email.sent": "accepted",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.failed": "failed",
  "email.suppressed": "failed",
  "email.complained": "complained",
};

/** Serializable retries are safe here: callbacks contain database work ONLY. */
export async function emailTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: "Serializable" });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (attempt >= 4 || (code !== "P2034" && code !== "P2002")) throw error;
    }
  }
}

/** Never turn stronger delivery evidence back into API acceptance or delay. */
export function nextDeliveryStatus(current: string, incoming: DeliveryStatus, stale: boolean): string {
  if (current === "complained") return current;
  if (incoming === "complained") return incoming;
  if (stale) return current;
  if (["failed", "bounced"].includes(current) && !["failed", "bounced"].includes(incoming)) return current;
  if (current === "delivered" && ["accepted", "delayed"].includes(incoming)) return current;
  return incoming;
}

/** Call after the worker's final submission gate, before the external send.
 * A duplicate key is intentionally an error, never permission to send again.
 */
export async function createApplicationEmailAttempt(input: {
  applicationId: string;
  attemptKey: string;
  recipient: string;
  recipientProvenanceJson?: string;
}): Promise<ApplicationEmailAttempt> {
  return prisma.applicationEmailAttempt.create({ data: {
    ...input, recipient: input.recipient.trim().toLowerCase(), status: "sending",
  } });
}

async function applyEvent(tx: Prisma.TransactionClient, attempt: ApplicationEmailAttempt, event: {
  id: string; type: string; occurredAt: Date; failureReason: string | null;
}): Promise<void> {
  const incoming = Object.hasOwn(DELIVERY_EVENT_STATUS, event.type) ? DELIVERY_EVENT_STATUS[event.type] : undefined;
  const stale = !!attempt.lastEventAt && event.occurredAt < attempt.lastEventAt;
  if (incoming) {
    const status = nextDeliveryStatus(attempt.status, incoming, stale);
    if (status !== attempt.status || (!stale && incoming === attempt.status)) {
      await tx.applicationEmailAttempt.update({ where: { id: attempt.id }, data: {
        status,
        // A delayed old complaint may change state, but cannot rewind ordering.
        ...(!stale ? { lastEventAt: event.occurredAt, lastEventType: event.type } : {}),
        ...(["failed", "bounced", "complained"].includes(status) ? {
          failureReason: event.failureReason ?? `provider_${status}`,
        } : { failureReason: null }),
      } });
      if (["failed", "bounced", "complained"].includes(status)) {
        await tx.application.updateMany({
          where: { id: attempt.applicationId },
          data: {
            status: "failed",
            sendStatus: "failed",
            sendFailureReason: `email_${status}`,
            errorMessage: status === "complained"
              ? "Il destinatario ha segnalato lo spam. Candidatura marcata fallita."
              : "Email non consegnata (bounce). Candidatura marcata fallita.",
          },
        });
      }
    }
  } else if (event.type === "email.opened") {
    // An open (which may be a proxy/bot) is neither a human reply nor a receipt.
    await tx.application.updateMany({ where: { id: attempt.applicationId, viewedAt: null }, data: { viewedAt: event.occurredAt } });
  }
  await tx.emailProviderEvent.update({ where: { id: event.id }, data: { attemptId: attempt.id, processedAt: new Date() } });
}

/** API acceptance is NOT delivery. Events that beat this write are reconciled. */
export async function recordApplicationEmailAccepted(attemptId: string, providerEmailId: string): Promise<void> {
  if (!providerEmailId.trim()) throw new Error("missing_provider_email_id");
  await emailTransaction(async (tx) => {
    let attempt = await tx.applicationEmailAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    if (attempt.providerEmailId && attempt.providerEmailId !== providerEmailId) throw new Error("immutable_provider_email_id");
    attempt = await tx.applicationEmailAttempt.update({ where: { id: attemptId }, data: {
      providerEmailId,
      acceptedAt: attempt.acceptedAt ?? new Date(),
      ...(["sending", "unknown"].includes(attempt.status) ? { status: "accepted", failureReason: null } : {}),
    } });
    const events = await tx.emailProviderEvent.findMany({ where: { providerEmailId, processedAt: null }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] });
    for (const event of events) {
      await applyEvent(tx, attempt, event);
      attempt = await tx.applicationEmailAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    }
  });
}

/** Network ambiguity is never declared a known failure or retried blindly. */
export async function recordApplicationEmailUncertain(attemptId: string, knownRejected = false): Promise<void> {
  await prisma.applicationEmailAttempt.updateMany({
    where: { id: attemptId, status: { in: ["sending", "unknown"] } },
    data: { status: knownRejected ? "failed" : "unknown", failureReason: knownRejected ? "provider_send_rejected" : "provider_acceptance_unknown" },
  });
}

/** Provider ID is authoritative. Unbound events remain durable for reconciliation. */
export async function recordApplicationDeliveryEvent(input: {
  providerEventId: string;
  providerEmailId: string;
  type: string;
  occurredAt: Date;
  /** Only pass these from an authenticated provider webhook. */
  attemptId?: string;
  recipients?: string[];
}): Promise<void> {
  await emailTransaction(async (tx) => {
    const event = await tx.emailProviderEvent.upsert({
      where: { providerEventId: input.providerEventId }, update: {},
      create: { providerEventId: input.providerEventId, providerEmailId: input.providerEmailId, type: input.type, occurredAt: input.occurredAt, failureReason: ["email.failed", "email.suppressed", "email.bounced", "email.complained"].includes(input.type) ? input.type : null },
    });
    if (event.providerEmailId !== input.providerEmailId || event.type !== input.type) throw new Error("provider_event_identity_conflict");
    if (event.processedAt) return;
    let attempt = await tx.applicationEmailAttempt.findUnique({ where: { providerEmailId: input.providerEmailId } });
    if (!attempt && input.attemptId) {
      // The provider may accept/send while the subsequent DB write fails. A
      // signed attempt tag AND exact destination recover the association. App
      // IDs or headers alone must never map arbitrary email events to users.
      const candidate = await tx.applicationEmailAttempt.findUnique({ where: { id: input.attemptId } });
      const recipients = input.recipients?.map((address) => address.trim().toLowerCase()) ?? [];
      if (candidate && !candidate.providerEmailId && recipients.length === 1 && recipients[0] === candidate.recipient) {
        attempt = await tx.applicationEmailAttempt.update({ where: { id: candidate.id }, data: { providerEmailId: input.providerEmailId, acceptedAt: candidate.acceptedAt ?? event.occurredAt } });
      }
    }
    if (attempt) {
      const pending = await tx.emailProviderEvent.findMany({ where: { providerEmailId: input.providerEmailId, processedAt: null }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] });
      for (const stored of pending) {
        await applyEvent(tx, attempt, stored);
        attempt = await tx.applicationEmailAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
      }
    }
  });
}
