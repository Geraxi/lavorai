import { createHash } from "node:crypto";
import type { CreateEmailOptions } from "resend";
import { prisma } from "@/lib/db";
import { applicationsPaused } from "@/lib/application-pause";
export { verifyProductionApplicationPause } from "@/lib/release-health";

/** A single owner-approved fictional diagnostic; never accepts caller data. */
export const RELEASE_CANARY = Object.freeze({
  mode: "email-20261013-owner",
  applicationId: "release_canary_email_20261013_owner",
  jobId: "release_canary_job_20261013_owner",
  attemptKey: "release-canary-email-20261013-owner-v1",
  from: "LavorAI <noreply@lavorai.it>",
  replyTo: "reply+release_canary_email_20261013_owner@inbound.lavorai.it",
  title: "[LavorAI TEST] Fictional applicant email roundtrip",
  company: "LavorAI Diagnostic (fictional)",
  description: "Owner-approved diagnostic with fictional applicant data only. This is not a job vacancy or an application to an employer.",
  url: "https://example.invalid/lavorai-release-canary-20261013",
  subject: "[LavorAI TEST · FICTIONAL APPLICANT] Email delivery and reply check",
  text: "LavorAI controlled diagnostic. THIS IS A TEST, NOT A REAL JOB APPLICATION.\n\nFictional applicant: Alex Example.\nFictional role: Test Engineer at Example Company (fictional).\nFictional experience: Creating synthetic test cases. No customer CV or personal candidate data is included.\n\nThis single email tests LavorAI's persisted send, provider delivery event, reply routing and Inbox display.\nPlease reply with: LavorAI fictional test reply received.\n\nCustomer applications remain paused. This diagnostic does not count as employer interest or an application outcome.",
});

export function normalizeCanaryAddress(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Exact canary recipients only. inbound.lavorai.it is not an open host:
 * user mailbox aliases live there and must not pass this fence.
 */
export const DEDICATED_TEST_DESTINATION_ADDRESSES = Object.freeze([
  normalizeCanaryAddress(RELEASE_CANARY.replyTo),
  "delivered@resend.dev",
  "bounced@resend.dev",
  "complained@resend.dev",
]);

export function isDedicatedTestDestination(email: string): boolean {
  const normalized = normalizeCanaryAddress(email);
  const at = normalized.indexOf("@");
  if (at < 1 || at === normalized.length - 1) return false;
  return (DEDICATED_TEST_DESTINATION_ADDRESSES as readonly string[]).includes(normalized);
}

// Public-safe pin for the approved exact [account ID, recipient] tuple.
// Values remain in server-only deployment configuration, never in this repo.
// The recipient must also be one of DEDICATED_TEST_DESTINATION_ADDRESSES.
const PINNED_OWNER_SHA256 = "5b54c0b214f7fc44298a02336a7960b90ae4a5b38e7c6da39f0b048831033ec6";
export function releaseCanaryOwner(): { userId: string; email: string } | null {
  const userId = process.env.LAVORAI_RELEASE_CANARY_OWNER_ID;
  const email = process.env.LAVORAI_RELEASE_CANARY_RECIPIENT;
  if (!userId || !email || !isDedicatedTestDestination(email)) return null;
  const digest = createHash("sha256").update(JSON.stringify([userId, email])).digest("hex");
  return digest === PINNED_OWNER_SHA256 ? { userId, email } : null;
}

export function releaseCanaryEnabled(): boolean {
  return applicationsPaused() && releaseCanaryOwner() !== null
    && process.env.LAVORAI_RELEASE_CANARY === RELEASE_CANARY.mode
    && process.env.INBOUND_EMAIL_DOMAIN === "inbound.lavorai.it";
}

export function releaseCanaryPayload(): CreateEmailOptions {
  const owner = releaseCanaryOwner();
  if (!owner) throw new Error("canary_owner_configuration_blocked");
  return { from: RELEASE_CANARY.from, to: owner.email, replyTo: RELEASE_CANARY.replyTo,
    subject: RELEASE_CANARY.subject, text: RELEASE_CANARY.text };
}

export const RELEASE_CANARY_PROVENANCE = JSON.stringify({
  kind: "owner_approved_fictional_release_diagnostic", date: "2026-10-13",
  applicationId: RELEASE_CANARY.applicationId, jobId: RELEASE_CANARY.jobId,
  recipient: "pinned_owner_only", employerProvenance: false,
});

type CanaryRequest = {
  applicationId: string; attemptKey: string; recipient: string; recipientProvenanceJson: string; payload: CreateEmailOptions;
};

export function isExactReleaseCanaryRequest(input: CanaryRequest): boolean {
  const owner = releaseCanaryOwner();
  if (!owner) return false;
  const expected = releaseCanaryPayload() as unknown as Record<string, unknown>;
  const actual = input.payload as unknown as Record<string, unknown>;
  return input.applicationId === RELEASE_CANARY.applicationId && input.attemptKey === RELEASE_CANARY.attemptKey
    && isDedicatedTestDestination(input.recipient)
    && input.recipient === owner.email && input.recipientProvenanceJson === RELEASE_CANARY_PROVENANCE
    // Exact keys block CC/BCC, arbitrary attachments, headers, templates and body changes.
    && Object.keys(actual).length === Object.keys(expected).length
    && Object.keys(expected).every(key => Object.hasOwn(actual, key) && actual[key] === expected[key]);
}

/** Fresh identity check at both admission and the final provider boundary.
 * No real applicant profile, document, preference or consent is read or changed.
 */
export async function authorizeReleaseCanary(input: CanaryRequest): Promise<boolean> {
  if (!releaseCanaryEnabled() || !isExactReleaseCanaryRequest(input)) return false;
  const owner = releaseCanaryOwner();
  if (!owner) return false;
  const app = await prisma.application.findUnique({ where: { id: RELEASE_CANARY.applicationId }, select: {
    id: true, userId: true, jobId: true, portal: true, status: true, sessionId: true,
    cvDocxPath: true, cvPdfPath: true, coverLetterPath: true, coverLetterText: true, consentGrantedAt: true,
    startedAt: true, submittedAt: true, submittedVia: true, submitConfirmation: true,
    user: { select: { id: true, email: true } },
    job: { select: { id: true, source: true, externalId: true, title: true, company: true,
      description: true, url: true, recruiterEmail: true, closedAt: true } },
  } });
  return !!app && app.userId === owner.userId && app.user.id === owner.userId
    && app.user.email === owner.email && app.jobId === RELEASE_CANARY.jobId
    && app.job.id === RELEASE_CANARY.jobId && app.portal === "release_canary" && app.status === "diagnostic"
    && [app.sessionId, app.cvDocxPath, app.cvPdfPath, app.coverLetterPath, app.coverLetterText, app.consentGrantedAt,
      app.startedAt, app.submittedAt, app.submittedVia].every(value => value === null)
    && app.submitConfirmation === "RELEASE_DIAGNOSTIC"
    && app.job.source === "release_canary" && app.job.externalId === RELEASE_CANARY.jobId
    && app.job.title === RELEASE_CANARY.title && app.job.company === RELEASE_CANARY.company
    && app.job.description === RELEASE_CANARY.description && app.job.url === RELEASE_CANARY.url
    && app.job.recruiterEmail === owner.email && app.job.closedAt !== null;
}
