import { Resend as ProviderResend } from "resend";
import { prisma } from "@/lib/db";
import { emailContext } from "@/lib/email-context";
import { acquireEmailDispatch, releaseEmailDispatch } from "@/lib/email-dispatch";
import { EmailDispatchError, providerFailure, EMAIL_REQUEST_TIMEOUT_MS } from "@/lib/email-dispatch-policy";
export type { CreateEmailOptions } from "resend";

/** All Resend producers use the same committed budget and cross-process lease.
 * This transport NEVER retries. Recruiter sends retain their one-attempt contract. */
export class Resend extends ProviderResend {
  constructor(apiKey?: string) {
    super(apiKey);
    const original = this.emails.send.bind(this.emails);
    const request = this.fetchRequest.bind(this);
    this.fetchRequest = (path, options = {}) => request(path, { ...options, signal: AbortSignal.timeout(EMAIL_REQUEST_TIMEOUT_MS) });
    this.emails.send = async (payload, options) => {
      const context = emailContext.getStore();
      const kind = context?.kind ?? "other";
      const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
      // Budget is per delivered email; current call sites use exactly one recipient.
      if (recipients.length !== 1 || payload.cc || payload.bcc) throw new EmailDispatchError("email_multiple_recipients_unsupported", false);
      const deadline = Date.now() + 5_000;
      let lease;
      while (!lease) {
        try { lease = await acquireEmailDispatch(kind, options?.idempotencyKey); }
        catch (error) {
          if (!(error instanceof EmailDispatchError) || error.message !== "email_rate_wait" || Date.now() >= deadline) throw error;
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      try {
        if (Date.now() + EMAIL_REQUEST_TIMEOUT_MS >= Math.min(+lease.until, context?.deadlineAt ?? Infinity)) throw new EmailDispatchError("email_dispatch_lease_expired", true, true);
        const response = await original(payload, options);
        if (response.error && context?.returnProviderErrors) return response;
        if (response.error || !response.data?.id) throw providerFailure(response.error);
        await prisma.emailLog.upsert({ where: { id: lease.id }, create: { id: lease.id, kind, to: context?.to ?? recipients[0] }, update: {} });
        return response;
      } finally {
        // If release fails, the persisted lease remains closed until expiry.
        await releaseEmailDispatch(lease.token).catch(() => undefined);
      }
    };
  }
}
