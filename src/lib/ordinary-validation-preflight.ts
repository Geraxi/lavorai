import type { PrismaClient } from '@prisma/client';
import { workerGateSelect, ordinaryWorkerIneligibility } from './application-worker-gates';
import { dailyApplicationLimit, hasPaidOrTrialApplicationAccess, usesFreeWeeklyQuota, freeWeeklyApplyQuota } from './billing';
import { dailyCapUsageWhere, weeklyQuotaUsageWhere } from './daily-application-cap';
import { applicationRolloutConfig } from './application-rollout';
import { inboundReplyAddress } from './email';

export const PREFLIGHT_USER_ID = 'cmvnz41b9pvoty0ufujkkx0zw';
export const PREFLIGHT_USER_EMAIL = 'email-test-20261025@lavorai.it';
export const PREFLIGHT_OFFER = 'https://produzioneweb.recruitee.com/o/lavorai-test-ordinary-validation';
type DB = Pick<PrismaClient, 'user' | 'application' | 'userInbox' | 'cVDocument' | 'applicationSubmissionReservation'>;

/** Reads only. No fixture creation, token, provider call, lease, reservation or scope activation. */
export async function ordinaryValidationPreflight(db: DB, now = new Date(), scope = { userId: PREFLIGHT_USER_ID, email: PREFLIGHT_USER_EMAIL }) {
  const user = await db.user.findUnique({ where: { id: scope.userId }, select: {
    ...workerGateSelect.user.select,
    preferences: { select: { ...workerGateSelect.user.select.preferences.select, dailyCap: true } },
  } });
  if (!user || user.email !== scope.email) return { status: 'blocked', reason: 'test_account_identity_mismatch' };
  const [apps, inbox, cvCount, dailyUsed, weeklyUsed, globalUsed] = await Promise.all([
    db.application.findMany({ where: { userId: scope.userId, job: { url: PREFLIGHT_OFFER } }, select: workerGateSelect, take: 2 }),
    db.userInbox.findUnique({ where: { userId: scope.userId }, select: { address: true, disabledAt: true } }),
    db.cVDocument.count({ where: { userId: scope.userId } }),
    db.application.count({ where: dailyCapUsageWhere(scope.userId, now) }),
    db.application.count({ where: weeklyQuotaUsageWhere(scope.userId, now) }),
    db.applicationSubmissionReservation.count({ where: { budgetDay: new Date(now.toISOString().slice(0,10)+'T00:00:00.000Z') } }),
  ]);
  const app = apps.length === 1 ? apps[0] : null;
  const paid = hasPaidOrTrialApplicationAccess(user, now);
  const free = usesFreeWeeklyQuota(user, now);
  const dailyLimit = dailyApplicationLimit(user, user.preferences?.dailyCap);
  const rollout = applicationRolloutConfig(now);
  const inboxAddress = inbox && !inbox.disabledAt ? inbox.address : null;
  const aliasEnabled = process.env.INBOUND_ROUTE_ATS_EMAIL !== 'false';
  const alias = app && aliasEnabled ? inboundReplyAddress(app.id) : null;
  // Same Recruitee precedence as attemptPortalAdapterSubmit. Without a row, an
  // enabled per-application alias cannot be resolved; never invent an app ID.
  const aliasConfigured = aliasEnabled && !!inboundReplyAddress('preflight-not-an-application');
  const recipientUnknown = !inboxAddress && !app && aliasConfigured;
  const formEmail = inboxAddress ?? alias ?? user.email;
  const recipient = recipientUnknown ? null : (formEmail !== user.email ? formEmail : user.cvProfile?.email?.trim() || formEmail);
  const blockers: string[] = [];
  if (process.env.APPLICATIONS_PAUSED !== 'true' || process.env.USER_NOTIFICATIONS_HOLD !== 'true' || process.env.ATS_TEST_REAL_SUBMIT !== 'false') blockers.push('required_holds_not_set');
  if (user.suspendedAt) blockers.push('user_suspended');
  if (!user.emailVerified) blockers.push('email_verification_missing');
  if (!user.privacyConsentAt) blockers.push('privacy_consent_missing');
  if (!paid && !free) blockers.push('billing_ineligible');
  if (!user.preferences || user.preferences.autoApplyMode === 'off') blockers.push('auto_apply_not_enabled');
  if (!user.cvProfile || !cvCount) blockers.push('profile_or_cv_missing');
  // Daily-cap figure is informational: worker admission enforces the shared
  // weekly free quota; do not turn a legacy daily display limit into a new gate.
  if (user.subscriptionStatus === 'paused' || (user.pausedUntil && user.pausedUntil > now)) blockers.push('subscription_paused');
  if (free && weeklyUsed >= freeWeeklyApplyQuota()) blockers.push('free_weekly_quota_reached');
  if (!rollout.enabled || globalUsed >= (rollout.dailyCap ?? 0)) blockers.push(rollout.reason ?? 'global_quota_reached');
  if (app) {
    const reason = ordinaryWorkerIneligibility(app, now);
    if (reason) blockers.push(reason);
    if (app.status !== 'queued' || app.startedAt || app.submitStartedAt || app.submittedAt || app.submitConfirmation || app.retryCount) blockers.push('application_not_fresh');
  } else if (apps.length > 1) blockers.push('multiple_matching_applications');
  const profileLabelMatches = user.cvProfile?.firstName === 'LavorAI' && user.cvProfile?.lastName === 'Test';
  return {
    status: blockers.length ? 'blocked' : 'unknown', // GET is never permission to submit.
    observedAt: now.toISOString(), userId: scope.userId, accountEmail: user.email, offerUrl: PREFLIGHT_OFFER,
    holds: { applicationsPaused: process.env.APPLICATIONS_PAUSED === 'true', notificationsHeld: process.env.USER_NOTIFICATIONS_HOLD === 'true', diagnosticRealSubmitDisabled: process.env.ATS_TEST_REAL_SUBMIT === 'false' },
    account: { verified: !!user.emailVerified, privacyConsentRecorded: !!user.privacyConsentAt, suspended: !!user.suspendedAt, subscriptionStatus: user.subscriptionStatus, paidOrTrialAccess: paid, freeQuotaApplies: free, mode: user.preferences?.autoApplyMode ?? null },
    quota: { dailyUsed, dailyLimit, weeklyUsed, weeklyLimit: free ? freeWeeklyApplyQuota() : null, globalUsed, globalLimit: rollout.dailyCap, snapshotOnly: true },
    profile: { exists: !!user.cvProfile, cvDocumentCount: cvCount, syntheticNameMatches: profileLabelMatches, phonePresent: !!user.cvProfile?.phone?.trim(), contentVerifiedSynthetic: 'unknown' },
    application: { count: apps.length, id: app?.id ?? null, status: app?.status ?? null },
    recipient: { address: recipient, source: inboxAddress ? 'user_inbox' : alias ? 'application_alias' : recipientUnknown ? 'application_id_required' : 'profile_or_account', ownership: 'unverified', receivingFunctionality: 'unverified' },
    blockers: [...new Set(blockers)],
    unknowns: [...(!app ? ['fresh_ordinary_application_required'] : []), 'synthetic_document_content_not_inspected', 'recipient_ownership_and_receiving_unverified', 'transactional_gates_rechecked_only_at_execution'],
  };
}
