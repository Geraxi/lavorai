/** Invoke once inside the existing worker runtime. Never exposes an HTTP route.
 * After the single attempt (including errors), idle until the operator changes
 * the start command. There is no automatic resend or customer-work loop.
 */
import { prisma } from "../lib/db";
import { canSendEmail } from "../lib/email-quota";
import { sendRecruiterEmailOnce } from "../lib/recruiter-delivery";
import { authorizeReleaseCanary, RELEASE_CANARY, RELEASE_CANARY_PROVENANCE, releaseCanaryEnabled, releaseCanaryPayload, releaseCanaryOwner, verifyProductionApplicationPause } from "../lib/release-email-canary";

class CanaryBlockedError extends Error {
  constructor(readonly code: "canary_configuration_blocked" | "canary_web_pause_not_verified" | "canary_owner_mismatch" | "canary_fixture_collision" | "canary_fixture_mismatch") { super(code); }
}

async function main(): Promise<void> {
  const target = releaseCanaryOwner();
  if (!target || !releaseCanaryEnabled()) throw new CanaryBlockedError("canary_configuration_blocked");
  if (!await verifyProductionApplicationPause()) throw new CanaryBlockedError("canary_web_pause_not_verified");
  const quota = await canSendEmail();
  if (!quota.allowed) {
    console.log(JSON.stringify({ kind: "canary_not_sent", reason: "email_quota_unavailable", today: quota.today, daily: quota.daily }));
    return;
  }
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${RELEASE_CANARY.attemptKey}))`;
    const owner = await tx.user.findUnique({ where: { id: target.userId }, select: { id: true, email: true } });
    if (!owner || owner.email !== target.email) throw new CanaryBlockedError("canary_owner_mismatch");
    const app = await tx.application.findUnique({ where: { id: RELEASE_CANARY.applicationId }, select: { id: true } });
    if (app) return; // Never rewrite existing fixtures or reset a durable send fence.
    const collision = await tx.job.findUnique({ where: { id: RELEASE_CANARY.jobId }, select: { id: true } });
    if (collision) throw new CanaryBlockedError("canary_fixture_collision");
    await tx.job.create({ data: {
      id: RELEASE_CANARY.jobId, externalId: RELEASE_CANARY.jobId, source: "release_canary",
      title: RELEASE_CANARY.title, company: RELEASE_CANARY.company, description: RELEASE_CANARY.description,
      url: RELEASE_CANARY.url, recruiterEmail: target.email, closedAt: new Date(),
    } });
    await tx.application.create({ data: {
      id: RELEASE_CANARY.applicationId, userId: target.userId, jobId: RELEASE_CANARY.jobId,
      portal: "release_canary", status: "diagnostic", submitConfirmation: "RELEASE_DIAGNOSTIC",
    } });
  });
  const input = { applicationId: RELEASE_CANARY.applicationId, attemptKey: RELEASE_CANARY.attemptKey,
    recipient: target.email, recipientProvenanceJson: RELEASE_CANARY_PROVENANCE, payload: releaseCanaryPayload() };
  if (!await authorizeReleaseCanary(input)) throw new CanaryBlockedError("canary_fixture_mismatch");
  const existing = await prisma.applicationEmailAttempt.findUnique({ where: { attemptKey: RELEASE_CANARY.attemptKey },
    select: { id: true, status: true, providerEmailId: true } });
  if (existing) {
    console.log(JSON.stringify({ kind: "canary_existing_attempt_no_resend", applicationId: RELEASE_CANARY.applicationId, ...existing }));
    return;
  }
  const result = await sendRecruiterEmailOnce({ ...input, releaseCanary: true });
  // IDs and delivery state only. No email body, provider response, credentials or customer data.
  console.log(JSON.stringify({ kind: "canary_result", applicationId: RELEASE_CANARY.applicationId, result }));
}

void main().catch(error => console.error(error instanceof CanaryBlockedError ? error.code : "canary_stopped_without_retry")).finally(async () => {
  await prisma.$disconnect().catch(() => {});
  console.log("release_canary_idle_no_worker_started");
  setInterval(() => {}, 60_000);
});
