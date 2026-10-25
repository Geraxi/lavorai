import { applicationsPaused } from "@/lib/application-pause";
import { authorizeReleaseCanary } from "@/lib/release-email-canary";
import { recruiterEmailFallbackEnabled } from "@/lib/recruiter-email-fallback";
import { Resend, type CreateEmailOptions } from "resend";
import { sendWithinQuota } from "@/lib/email-quota";
import { createApplicationEmailAttempt, recordApplicationEmailAccepted, recordApplicationEmailUncertain } from "@/lib/application-delivery";
import { canSendToRecipientDomain } from "@/lib/recipient-domain-quota";
import { isActiveRecruiterEmailStatus } from "@/lib/recruiter-email-send";
import { prisma } from "@/lib/db";

export type RecruiterDeliveryResult =
  | { kind: "accepted"; attemptId: string; providerEmailId: string }
  | { kind: "not_sent"; reason: string }
  | { kind: "uncertain"; attemptId: string | null };

interface Dependencies {
  withinQuota: typeof sendWithinQuota;
  createAttempt: typeof createApplicationEmailAttempt;
  accepted: typeof recordApplicationEmailAccepted;
  uncertain: typeof recordApplicationEmailUncertain;
  recipientDomainAllowed: typeof canSendToRecipientDomain;
  findAttempt: (attemptKey: string) => Promise<{
    id: string; status: string; providerEmailId: string | null; acceptedAt: Date | null;
  } | null>;
  send: (payload: CreateEmailOptions, key: string) => Promise<{ data: { id: string } | null; error: { name: string; statusCode?: number | null } | null }>;
}

/** A durable attempt is recorded BEFORE sending. This function never retries a
 * send: idempotency is defense-in-depth, not permission to replay unknown work.
 */
export async function sendRecruiterEmailOnce(input: {
  applicationId: string;
  attemptKey: string;
  recipient: string;
  recipientProvenanceJson: string;
  payload: CreateEmailOptions;
  beforeSend?: () => Promise<boolean>;
  /** Only the fixed server-side fictional diagnostic can use this path. */
  releaseCanary?: true;
}, overrides: Partial<Dependencies> = {}): Promise<RecruiterDeliveryResult> {
  const canary = input.releaseCanary === true;
  if (canary ? !await authorizeReleaseCanary(input) : applicationsPaused()) {
    return { kind: "not_sent", reason: "applications_paused" };
  }
  if (!canary && !recruiterEmailFallbackEnabled()) {
    return { kind: "not_sent", reason: "recruiter_email_fallback_disabled" };
  }
  const deps: Dependencies = {
    withinQuota: sendWithinQuota,
    createAttempt: createApplicationEmailAttempt,
    accepted: recordApplicationEmailAccepted,
    uncertain: recordApplicationEmailUncertain,
    recipientDomainAllowed: canSendToRecipientDomain,
    findAttempt: async (attemptKey) => prisma.applicationEmailAttempt.findUnique({
      where: { attemptKey }, select: { id: true, status: true, providerEmailId: true, acceptedAt: true },
    }),
    send: async (payload, key) => {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) throw new Error("email_provider_not_configured");
      return new Resend(apiKey).emails.send(payload, { idempotencyKey: key });
    },
    ...overrides,
  };
  let attemptId: string | null = null;
  let crossedProviderBoundary = false;
  let attemptCreationStarted = false;
  let result: RecruiterDeliveryResult = { kind: "not_sent", reason: "email_quota_unavailable" };
  try {
    const existing = await deps.findAttempt(input.attemptKey);
    if (existing) {
      if (existing.providerEmailId && existing.acceptedAt) {
        return { kind: "accepted", attemptId: existing.id, providerEmailId: existing.providerEmailId };
      }
      if (existing.providerEmailId || isActiveRecruiterEmailStatus(existing.status)) {
        return { kind: "uncertain", attemptId: existing.id };
      }
    }
    const domainQuota = await deps.recipientDomainAllowed(input.recipient);
    if (!domainQuota.allowed) return { kind: "not_sent", reason: domainQuota.reason ?? "recipient_domain_rate_limited" };
    const quota = await deps.withinQuota(canary ? "release_canary" : "application_sent", input.recipient, async () => {
      attemptCreationStarted = true;
      const attempt = await deps.createAttempt({
        applicationId: input.applicationId,
        attemptKey: input.attemptKey,
        recipient: input.recipient,
        recipientProvenanceJson: input.recipientProvenanceJson,
      });
      attemptId = attempt.id;
      // Re-read current eligibility after quota/attempt persistence and just
      // before transmission. A denied gate cannot contact the employer.
      if ((canary ? !await authorizeReleaseCanary(input) : applicationsPaused())
        || (input.beforeSend && !await input.beforeSend())) {
        await deps.uncertain(attempt.id, true);
        result = { kind: "not_sent", reason: "current_gate_blocked" };
        throw new Error("current_gate_blocked");
      }
      crossedProviderBoundary = true;
      const response = await deps.send({
        ...input.payload,
        // Caller cannot accidentally send to a different target than the
        // immutable attempt. Candidate context is not put into provider tags.
        to: input.recipient,
        tags: [{ name: "app_id", value: input.applicationId }, { name: "attempt_id", value: attempt.id }],
      }, input.attemptKey);
      if (response.error) {
        // Resend also RETURNS application_error for transport/JSON failures,
        // which may occur after acceptance. Only an explicit rejection status
        // can release the no-send fence; timeouts/conflicts/5xx remain unknown.
        const rejectedStatuses = new Set([400, 401, 403, 404, 405, 413, 415, 422, 429]);
        const knownRejected = typeof response.error.statusCode === "number"
          && rejectedStatuses.has(response.error.statusCode)
          && !["application_error", "internal_server_error", "concurrent_idempotent_requests", "invalid_idempotent_request"].includes(response.error.name);
        await deps.uncertain(attempt.id, knownRejected);
        if (knownRejected) result = { kind: "not_sent", reason: "provider_rejected" };
        throw new Error(knownRejected ? "provider_rejected" : "provider_acceptance_unknown");
      }
      if (!response.data?.id) throw new Error("missing_provider_email_id");
      // An idempotent DB write may be retried, but the provider send may not.
      await deps.accepted(attempt.id, response.data.id);
      result = { kind: "accepted", attemptId: attempt.id, providerEmailId: response.data.id };
    });
    if (!quota.sent) return { kind: "not_sent", reason: "email_quota_unavailable" };
    return result;
  } catch {
    if (result.kind === "not_sent" && ["provider_rejected", "current_gate_blocked"].includes(result.reason)) return result;
    // A duplicate/ambiguous attempt insert may refer to an already in-flight
    // send. Never release its fence by declaring this application not sent.
    if (!crossedProviderBoundary) return attemptCreationStarted
      ? { kind: "uncertain", attemptId }
      : { kind: "not_sent", reason: "email_quota_unavailable" };
    if (attemptId) await deps.uncertain(attemptId).catch(() => {});
    return { kind: "uncertain", attemptId };
  }
}
