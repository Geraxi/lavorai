import { answerContinuationIneligibility, answerConfirmationDigest, continuationDigest, continuationSelect, parseAnswerContinuation, ANSWERS_CONSENT_NOTE, BLANK_FORM_EVIDENCE, CONTINUATION_CHANNELS, STAGED_CHANNELS, type AnswerContinuation, type PreTransmissionEvidence } from "./application-answer-continuation";
import { candidateFacts, resolveCandidateFact } from "./candidate-facts";
import { parseAnswers } from "./application-answers";
import { completesApplicationQuestion, resolveExplicitApplicationAnswer, parseApplicationQuestion } from "./application-question-answers";
import { applicationsPaused } from "@/lib/application-pause";
import { applicationRolloutConfig, rolloutApplicationIneligibility, ROLLOUT_BUDGET_HELD_MESSAGE } from "@/lib/application-rollout";
import { reserveSubmissionBudget, submissionSubjectKey } from "@/lib/application-submission-budget";
import type { Prisma, PrismaClient } from "@prisma/client";
import { autoApplyPreferenceMismatch, parsePreferenceList, isAvoidedCompany } from "@/lib/auto-apply-preferences";
import { rowToProfile } from "@/lib/cv-profile-types";
import { quickMatchScore } from "@/lib/match-score";
import { titleMatchesAnyRole } from "@/lib/role-match";
import { parseVerifiedSubmissionReceipt, receiptJobId } from "@/lib/submission-receipt";
import { canonicalPostingKey, DUPLICATE_POSTING_MESSAGE } from "@/lib/posting-key";
import { prisma } from "@/lib/db";
import { isApplicationAccessPaused, isLifetimeProPlus, requiresPaymentMethodBeforeApp } from "@/lib/billing";

// Persisted before crossing a delivery boundary. A crash/timeout never releases
// this reservation: only a proved no-send outcome or an atomic success does.
export const SUBMISSION_STARTED = "SUBMISSION_STARTED";
export const NOT_SUBMITTED = "NOT_SUBMITTED";
export const WORK_RESERVED_STATUSES = ["optimizing", "applying", "submitting", "ready_to_apply", "awaiting_consent", "needs_answers", "needs_session", "answers_claimed"];
const evidenceSelect = {
  submittedAt: true, submittedVia: true, submitConfirmation: true, canaryLog: true,
  answersUsedJson: true, viewedAt: true, lastReplyAt: true, replyCount: true, userStatus: true,
} as const;
export const workerGateSelect = {
  sessionId: true, cvDocxPath: true, ...evidenceSelect, ...continuationSelect,
  job: { select: { closedAt: true, url: true, company: true, title: true, description: true, location: true,
    remote: true, contractType: true, salaryMin: true, salaryMax: true } },
  session: { select: { id: true, userId: true, status: true, sentCount: true, targetCount: true, title: true, label: true } },
  user: { select: {
    email: true, yearsExperience: true, englishLevel: true, noticePeriod: true, tier: true, createdAt: true, trialEndsAt: true, trialGraceEndsAt: true,
    subscriptionStatus: true, currentPeriodEnd: true, pausedUntil: true, suspendedAt: true,
    emailVerified: true, privacyConsentAt: true, avoidCompanies: true,
    cvProfile: { select: { firstName: true, lastName: true, email: true, phone: true, city: true, title: true, summary: true,
      experiencesJson: true, educationJson: true, skillsJson: true, languagesJson: true, linksJson: true } },
    preferences: { select: { autoApplyMode: true, rolesJson: true, locationsJson: true,
      applicationAnswersJson: true, employmentType: true, salaryMin: true, matchMin: true, sourcesJson: true } },
  } },
} satisfies Prisma.ApplicationSelect;
export type WorkerGateRow = Prisma.ApplicationGetPayload<{ select: typeof workerGateSelect }>;
type DB = Pick<PrismaClient, "application" | "$transaction">;

export function hasPotentialSubmission(row: Pick<WorkerGateRow, keyof typeof evidenceSelect>): boolean {
  if (row.submittedAt || row.submittedVia || row.viewedAt || row.lastReplyAt || row.replyCount || row.userStatus) return true;
  // Only explicit proof of no delivery can clear earlier form/debug evidence.
  if ([NOT_SUBMITTED, "DRY_RUN", "JOB_CLOSED"].includes(row.submitConfirmation ?? "")) return false;
  return !!(row.submitConfirmation || row.canaryLog || row.answersUsedJson);
}

export function currentWorkerIneligibility(row: WorkerGateRow, now = new Date()): string | null {
  if (applicationsPaused()) return "applications_paused";
  const rolloutReason = rolloutApplicationIneligibility(row, now);
  if (rolloutReason) return rolloutReason;
  const user = row.user;
  if (user.suspendedAt) return "user_suspended";
  if (!user.privacyConsentAt) return "privacy_consent_missing";
  if (!user.emailVerified) return "email_verification_missing";
  const mode = user.preferences?.autoApplyMode;
  if (mode === "off" || !mode || (mode !== "auto" && !(["manual", "hybrid"].includes(mode) && row.consentGrantedAt))) return "auto_apply_not_enabled";
  if (user.subscriptionStatus === "paused" || (user.pausedUntil && user.pausedUntil > now)) return "subscription_paused";
  if (!isLifetimeProPlus(user.email) && (isApplicationAccessPaused(user)
    || requiresPaymentMethodBeforeApp(user) || !["active", "trialing"].includes(user.subscriptionStatus ?? "")
    || (user.currentPeriodEnd !== null && user.currentPeriodEnd <= now))) return "billing_ineligible";
  if (row.job.closedAt) return "job_closed";
  if (isAvoidedCompany(row.job.company, user.avoidCompanies)) return "company_avoided";
  if (row.sessionId && (!row.session || row.session.userId !== row.userId
    || !["active", "auto"].includes(row.session.status))) return "session_inactive";
  if (row.session && row.session.sentCount >= row.session.targetCount) return "session_capacity_reached";
  // Explicit single-job consent may override search preferences. Automatic
  // selection must re-evaluate current facts after the queue wait and at send.
  if (mode === "auto" && !row.consentGrantedAt) {
    const preferences = user.preferences!;
    const locations = parsePreferenceList(preferences.locationsJson);
    const roles = parsePreferenceList(preferences.rolesJson);
    if (!locations?.length || roles === null) return "preferences_unverified";
    const roundRole = row.session?.title?.trim() || row.session?.label?.trim();
    const currentRoles = [...roles, ...(roundRole && !roundRole.includes("·") ? [roundRole] : [])];
    if (!currentRoles.length || !titleMatchesAnyRole(row.job.title, currentRoles)) return "preference_role";
    const mismatch = autoApplyPreferenceMismatch(row.job, preferences, locations);
    if (mismatch) return `preference_${mismatch}`;
    if (!user.cvProfile) return "profile_unverified";
    const profile = rowToProfile(user.cvProfile);
    if (!profile.title && !profile.summary && !profile.skills.length && !profile.experiences.length) return "profile_unverified";
    const score = quickMatchScore(profile, `${row.job.title}\n${row.job.company ?? ""}\n${row.job.description}`);
    if (preferences.matchMin > 0 && score < preferences.matchMin) return "preference_match_threshold";
  }
  return null;
}

async function withLockedApplication<T>(id: string, db: DB, operation: (tx: Prisma.TransactionClient, row: WorkerGateRow | null) => Promise<T>): Promise<T | null> {
  const identity = await db.application.findUnique({ where: { id }, select: { userId: true, sessionId: true, jobId: true } });
  if (!identity) return null;
  return db.$transaction(async (tx) => {
    // Shared with retry admission and all worker delivery paths. Row locks also
    // serialize ordinary pause/billing/consent changes at this decision point.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${identity.userId}))`;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${identity.userId} FOR UPDATE`;
    if (identity.sessionId) await tx.$queryRaw`SELECT id FROM "ApplicationSession" WHERE id = ${identity.sessionId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "UserPreferences" WHERE "userId" = ${identity.userId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Job" WHERE id = ${identity.jobId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Application" WHERE id = ${id} FOR UPDATE`;
    const row = await tx.application.findUnique({ where: { id }, select: workerGateSelect });
    // Changing ownership/round while admission waits needs a fresh invocation.
    if (row && (row.userId !== identity.userId || row.sessionId !== identity.sessionId || row.jobId !== identity.jobId)) return null;
    return operation(tx, row);
  });
}

async function capacityAvailable(tx: Prisma.TransactionClient, row: WorkerGateRow): Promise<boolean> {
  if (!row.session) return true;
  const others = await tx.application.findMany({
    where: { sessionId: row.session.id, id: { not: row.id } },
    select: { status: true, ...evidenceSelect },
  });
  const successes = others.filter((other) => other.status === "success").length;
  const reservations = others.filter((other) => other.status !== "success"
    && (WORK_RESERVED_STATUSES.includes(other.status) || hasPotentialSubmission(other))).length;
  return Math.max(row.session.sentCount, successes) + reservations < row.session.targetCount;
}

/** Exact text persisted on a held queued row; held-application-release.ts
 * matches on it to release only rows held for a specific, now-cleared reason. */
export function heldMessage(reason: string): string {
  const explanations: Record<string, string> = {
    auto_apply_not_enabled: "Consenso specifico non verificabile nella modalità corrente",
    session_inactive: "Round in pausa, concluso o annullato",
    session_capacity_reached: "Limite del round occupato da invii o candidature ancora in attesa",
    user_suspended: "Account sospeso",
    consent_or_verification_missing: "Verifica email o consenso privacy da completare",
    privacy_consent_missing: "Consenso privacy mancante. Apri Impostazioni → Consenso privacy (/settings#privacy-consent) per leggere l’informativa e scegliere se acconsentire",
    email_verification_missing: "Verifica l’indirizzo email del tuo account",
    subscription_paused: "Abbonamento in pausa",
    billing_ineligible: "Abbonamento non attivo o scaduto",
    job_closed: "Annuncio chiuso",
    company_avoided: "Azienda esclusa dalle preferenze correnti",
    preferences_unverified: "Preferenze correnti incomplete o non verificabili",
    profile_unverified: "Profilo professionale non verificabile",
    preference_role: "Ruolo non compatibile con le preferenze o il round corrente",
    preference_location: "Località non compatibile con le preferenze correnti",
    preference_location_unverified: "Requisiti geografici della posizione da verificare",
    preference_employment: "Tipo di contratto non compatibile con le preferenze correnti",
    preference_salary: "Retribuzione inferiore alla preferenza corrente",
    preference_match_threshold: "Compatibilità con il profilo inferiore alla soglia scelta",
  };
  return `Invio in attesa: ${explanations[reason] ?? reason}. Questa elaborazione non ha effettuato nuovi invii.`;
}

/** The queued -> optimizing transition is the durable round reservation.
 * Queued backlog is preserved; it cannot consume additional slots concurrently.
 * startedAt is an ownership token so a recovered/stale worker cannot submit.
 */
export async function reserveApplicationWork(id: string, db: DB = prisma): Promise<Date | null> {
  return withLockedApplication(id, db, async (tx, row) => {
    if (!row || !["queued", "answers_claimed"].includes(row.status)) return null;
    const continuation = parseAnswerContinuation(row.answerContinuationJson);
    if (row.answerContinuationJson) {
      if (answerContinuationIneligibility(row, "queued", row.job.url) || currentWorkerIneligibility(row)
        || !await capacityAvailable(tx, row) || !await continuationReservationMatches(tx, row, continuation!)) return null;
      const token = new Date(Math.max(Date.now(), +row.startedAt! + 1));
      await tx.application.update({ where: { id }, data: {
        status: "optimizing", startedAt: token, errorMessage: null,
        answerContinuationJson: JSON.stringify({ ...continuation, phase: "running", workToken: token.toISOString() }),
      } });
      return token;
    }
    if (row.status !== "queued") return null;
    if (rolloutApplicationIneligibility(row)) return null;
    // An immutable budget record survives every ordinary status/reset path.
    // A previous attempt is never eligible for preparation/replay in this mode.
    if (await tx.applicationSubmissionReservation.findFirst({ where: { OR: [
      { applicationId: id }, { subjectKey: submissionSubjectKey(row.userId, row.jobId) },
    ] }, select: { id: true } })) {
      // Never leave a claimed row silently "queued" (startedAt set, no message):
      // the poller only claims startedAt=null, so it would be frozen with no
      // explanation. Record the reason and move it out of the queue. Nothing is sent.
      await tx.application.update({ where: { id }, data: {
        status: "ready_to_apply",
        errorMessage: "Invio precedente o tentativo con esito da verificare. Nessun nuovo invio automatico: controlla la consegna prima di ritentare.",
      } });
      return null;
    }
    if (hasPotentialSubmission(row) || (row.cvDocxPath && ![NOT_SUBMITTED, "DRY_RUN", "JOB_CLOSED"].includes(row.submitConfirmation ?? ""))) {
      await tx.application.update({ where: { id }, data: {
        status: "ready_to_apply",
        errorMessage: "Invio precedente o tentativo con esito da verificare. Nessun nuovo invio automatico: controlla la consegna prima di ritentare.",
      } });
      return null;
    }
    const reason = currentWorkerIneligibility(row);
    if (reason || !await capacityAvailable(tx, row)) {
      await tx.application.update({ where: { id }, data: {
        startedAt: new Date(), errorMessage: heldMessage(reason ?? "session_capacity_reached"),
      } });
      return null;
    }
    const siblings = await tx.application.findMany({
      where: { userId: row.userId, jobId: row.jobId, id: { not: id } },
      select: { status: true, cvDocxPath: true, ...evidenceSelect },
    });
    // Temporary rollout excludes retries through a newly-created duplicate as
    // well as resets of an old row, even if the predecessor proved no send.
    if (siblings.length) {
      await tx.application.update({ where: { id }, data: {
        startedAt: new Date(),
        errorMessage: "Invio in attesa: esiste un'altra candidatura per questa offerta, già inviata o da verificare. Questa elaborazione non ha effettuato nuovi invii.",
      } });
      return null;
    }
    const token = new Date();
    await tx.application.update({ where: { id }, data: {
      status: "optimizing", startedAt: token, completedAt: null, errorMessage: null,
    } });
    return token;
  });
}

/** Recheck fresh gates immediately before form/data transmission or email.
 * This marker must never be reset by recovery or ordinary queue publication.
 */
export async function beginApplicationSubmission(id: string, token: Date, db: DB = prisma, channel = ""): Promise<boolean> {
  return (await withLockedApplication(id, db, async (tx, row) => {
    if (!row || row.startedAt?.getTime() !== token.getTime()
      || !["optimizing", "ready_to_apply"].includes(row.status) || hasPotentialSubmission(row)) return false;
    if (rolloutApplicationIneligibility(row)) return false;
    const reason = currentWorkerIneligibility(row);
    if (reason || !await capacityAvailable(tx, row)) {
      await tx.application.update({ where: { id }, data: {
        status: "queued", startedAt: new Date(), submitConfirmation: NOT_SUBMITTED,
        errorMessage: heldMessage(reason ?? "session_capacity_reached"),
      } });
      return false;
    }
    if (await postingAlreadyClaimed(tx, row)) {
      // Nothing crossed a delivery boundary for THIS row (hasPotentialSubmission
      // was false above): record a typed, user-readable no-send outcome.
      await tx.application.update({ where: { id }, data: {
        status: "failed", submitConfirmation: NOT_SUBMITTED, errorMessage: DUPLICATE_POSTING_MESSAGE, completedAt: new Date(),
      } });
      return false;
    }
    const continuation = parseAnswerContinuation(row.answerContinuationJson);
    if (row.answerContinuationJson && (!continuation || answerContinuationIneligibility(row, "running", row.job.url)
      || continuation.channel !== channel || !await continuationReservationMatches(tx, row, continuation))) return false;
    if (["portal_greenhouse", "portal_recruitee"].includes(channel) && !await destinationIsUnique(tx, row, channel)) return false;
    const budgetReason = await reserveSubmissionBudget(tx, { applicationId: id,
      subjectKey: submissionSubjectKey(row.userId, row.jobId), attemptStartedAt: continuation ? new Date(continuation.attemptStartedAt) : token, channel }, continuation ? "recheck" : "begin");
    if (budgetReason) {
      await tx.application.update({ where: { id }, data: {
        status: "ready_to_apply",
        submitConfirmation: budgetReason === "rollout_daily_budget_reached" ? NOT_SUBMITTED : "UNCONFIRMED",
        errorMessage: budgetReason === "rollout_daily_budget_reached" ? ROLLOUT_BUDGET_HELD_MESSAGE : heldMessage(budgetReason),
      } });
      return false;
    }
    await tx.application.update({ where: { id }, data: { status: "applying", submitConfirmation: SUBMISSION_STARTED } });
    return true;
  })) === true;
}

/** Recheck after a long form fill, immediately before its final submit. A
 * stopped attempt may already have transmitted uploads; retain its reservation
 * and uncertainty rather than permitting an automatic replay.
 */
export async function recheckApplicationSubmission(id: string, token: Date, db: DB = prisma, channel = "", boundary: "final_submit" | "candidate_data" | "verification_submit" = "final_submit"): Promise<boolean> {
  return (await withLockedApplication(id, db, async (tx, row) => {
    if (!row || row.startedAt?.getTime() !== token.getTime()
      || row.status !== "applying" || row.submitConfirmation !== SUBMISSION_STARTED) return false;
    const continuation = parseAnswerContinuation(row.answerContinuationJson);
    const staged = STAGED_CHANNELS.includes(channel);
    if (boundary === "verification_submit" && channel !== "portal_greenhouse") return false;
    if (boundary !== "final_submit" && !staged) return false;
    // Continuations are one-way: blank inspection -> candidate data -> final
    // submit -> optional security-code submit. Each boundary is consumed once.
    if (continuation) {
      if (boundary === "candidate_data") {
        if (continuation.candidateDataStartedAt || continuation.finalSubmitStarted || continuation.verificationSubmitStarted) return false;
      } else if (staged) {
        if (!continuation.candidateDataStartedAt || continuation.verificationSubmitStarted) return false;
        if (boundary === "final_submit" && continuation.finalSubmitStarted) return false;
        if (boundary === "verification_submit" && !continuation.finalSubmitStarted) return false;
      } else if (continuation.finalSubmitStarted) return false;
    }
    const preTransmissionProof = continuation ? JSON.stringify({ ...continuation, candidateDataStartedAt: undefined, finalSubmitStarted: false, verificationSubmitStarted: undefined }) : null;
    if (row.answerContinuationJson && (!continuation || continuation.channel !== channel
      || answerContinuationIneligibility({ ...row, answerContinuationJson: preTransmissionProof, status: "ready_to_apply", submitConfirmation: NOT_SUBMITTED }, "running", row.job.url)
      || !await continuationReservationMatches(tx, row, continuation))) return false;
    if (["portal_greenhouse", "portal_recruitee"].includes(channel) && !await destinationIsUnique(tx, row, channel)) return false;
    const reason = currentWorkerIneligibility(row)
      ?? await reserveSubmissionBudget(tx, { applicationId: id,
        subjectKey: submissionSubjectKey(row.userId, row.jobId), attemptStartedAt: continuation ? new Date(continuation.attemptStartedAt) : token, channel }, "recheck");
    if (reason || !await capacityAvailable(tx, row)) {
      await tx.application.update({ where: { id }, data: {
        status: "ready_to_apply", submitConfirmation: "UNCONFIRMED",
        errorMessage: `Invio finale interrotto: ${reason ?? "session_capacity_reached"}. Il portale potrebbe aver già ricevuto dati o allegati. Verifica l'esito prima di un nuovo tentativo.`,
      } });
      return false;
    }
    if (continuation) await tx.application.update({ where: { id }, data: {
      answerContinuationJson: JSON.stringify({ ...continuation,
        ...(boundary === "candidate_data" ? { candidateDataStartedAt: new Date().toISOString() }
          : boundary === "verification_submit" ? { verificationSubmitStarted: true } : { finalSubmitStarted: true }),
      }),
    } });
    return true;
  })) === true;
}

/** No gap between releasing an in-flight slot and incrementing sentCount;
 * replaying a successful result is a no-op, including after notification errors.
 */
export async function completeApplicationSubmission(
  id: string, token: Date, data: Prisma.ApplicationUpdateManyMutationInput, db: DB = prisma,
): Promise<boolean> {
  if (typeof data.submitConfirmation !== "string"
    || !(data.submitConfirmation.startsWith("DETECTED") || data.submitConfirmation === "EMAIL_SENT")
    || data.submittedVia === "mock_demo") return false;
  return (await withLockedApplication(id, db, async (tx, row) => {
    if (!row || row.startedAt?.getTime() !== token.getTime()) return false;
    const inFlight = row.status === "applying" && row.submitConfirmation === SUBMISSION_STARTED;
    const recovered = row.status === "ready_to_apply" && row.submitConfirmation === "UNCONFIRMED";
    if (!inFlight && !recovered) return false;
    const continuation = parseAnswerContinuation(row.answerContinuationJson);
    if (row.answerContinuationJson && (!continuation || continuation.workToken !== token.toISOString() || !continuation.finalSubmitStarted)) return false;
    const reservation = await tx.applicationSubmissionReservation.findFirst({ where: {
      applicationId: id, subjectKey: submissionSubjectKey(row.userId, row.jobId), attemptStartedAt: continuation ? new Date(continuation.attemptStartedAt) : token,
      channel: typeof data.submittedVia === "string" ? data.submittedVia : "",
    }, select: { id: true } });
    if (!reservation) return false;
    if (data.submittedVia === "email_recruiter" && data.submitConfirmation === "EMAIL_SENT") {
      const attempt = await tx.applicationEmailAttempt.findUnique({
        where: { attemptKey: `application-${id}-${token.getTime()}` },
        select: { applicationId: true, providerEmailId: true, acceptedAt: true },
      });
      if (!attempt || attempt.applicationId !== id || !attempt.providerEmailId?.trim() || !attempt.acceptedAt) return false;
    } else {
      if (typeof data.submittedVia !== "string" || !data.submittedVia.startsWith("portal_") || typeof data.submissionReceiptJson !== "string") return false;
      const receipt = parseVerifiedSubmissionReceipt(data.submissionReceiptJson, data.submittedVia);
      if (!receipt || receipt.jobId !== receiptJobId(receipt.provider, row.job.url)
        || Date.parse(receipt.capturedAt) < token.getTime() || Date.parse(receipt.capturedAt) > Date.now() + 60_000) return false;
    }
    // Recovery does not replace the owner token. A late, proved receipt from
    // that same attempt is still recorded once, without ever replaying it.
    const changed = await tx.application.updateMany({ where: {
      id, startedAt: token, status: row.status, submitConfirmation: row.submitConfirmation,
    }, data: { ...data, status: "success", sentNotificationRequiredAt: new Date() } });
    // Intent commits atomically with the receipt/outcome. Reconciliation can
    // rebuild a missing outbox row after a crash; legacy completions have no intent.
    if (changed.count !== 1) return false;
    if (row.session) {
      const successes = await tx.application.count({ where: { sessionId: row.session.id, status: "success" } });
      const sentCount = Math.max(row.session.sentCount + 1, successes);
      await tx.applicationSession.update({ where: { id: row.session.id }, data: {
        sentCount,
        ...(["active", "auto"].includes(row.session.status) && sentCount >= row.session.targetCount
          ? { status: "completed", completedAt: new Date() } : {}),
      } });
    }
    return true;
  })) === true;
}


/** Read-only validation never refunds, replaces or deletes a reservation. */
async function continuationReservationMatches(tx: Prisma.TransactionClient, row: WorkerGateRow, proof: AnswerContinuation): Promise<boolean> {
  if (!CONTINUATION_CHANNELS.includes(proof.channel)) return false;
  const subjectKey = submissionSubjectKey(row.userId, row.jobId);
  const reservations = await tx.applicationSubmissionReservation.findMany({ where: { OR: [{ applicationId: row.id }, { subjectKey }] } });
  if (!reservations.length || reservations.some(r => r.applicationId !== row.id || r.subjectKey !== subjectKey
    || r.channel !== proof.channel || r.attemptStartedAt.toISOString() !== proof.attemptStartedAt
    || r.rolloutStartedAt.toISOString() !== applicationRolloutConfig().startedAt?.toISOString())) return false;
  if (await tx.applicationEmailAttempt.findFirst({ where: { applicationId: row.id }, select: { id: true } })) return false;
  if (await tx.application.findFirst({ where: { userId: row.userId, jobId: row.jobId, id: { not: row.id } }, select: { id: true } })) return false;
  return destinationIsUnique(tx, row, proof.channel);
}

/** Greenhouse board-host aliases and embedded forms identify the same global
 * posting. Recruitee slugs are scoped to the employer's origin. */
export function continuationDestination(channel: string, value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (channel === "portal_greenhouse") {
      const native = /^(?:boards|job-boards|jobs)\.greenhouse\.io$/i.test(url.hostname);
      const posting = native ? url.pathname.match(/\/jobs\/(\d+)(?:\/|$)/)?.[1] ?? (url.pathname === "/embed/job_app" ? url.searchParams.get("token") : null) : url.searchParams.get("gh_jid");
      return posting && /^\d+$/.test(posting) ? `greenhouse:${posting}` : null;
    }
    if (channel === "portal_ashby") {
      const posting = /(^|\.)ashbyhq\.com$/i.test(url.hostname) ? receiptJobId("ashby", value) : null;
      return posting ? `ashby:${posting.toLowerCase()}` : null;
    }
    const posting = receiptJobId("recruitee", value);
    return channel === "portal_recruitee" && posting ? `${url.origin}/o/${posting}` : null;
  } catch { return null; }
}

/** One submission per user + POSTING (not per internal Job row), on every
 * channel. Runs under the per-user advisory lock of withLockedApplication, so
 * two workers handling sibling rows of the same posting are serialized: the
 * second one sees the first one's SUBMISSION_STARTED fence or reservation. */
export async function postingAlreadyClaimed(tx: Prisma.TransactionClient, row: Pick<WorkerGateRow, "id" | "userId" | "jobId"> & { job: { url: string } }): Promise<boolean> {
  const key = canonicalPostingKey(row.job.url);
  if (!key) return false;
  const others = await tx.application.findMany({ where: { userId: row.userId, id: { not: row.id } },
    select: { jobId: true, status: true, ...evidenceSelect, job: { select: { url: true } } } });
  const siblings = others.filter(other => canonicalPostingKey(other.job.url) === key);
  if (!siblings.length) return false;
  if (siblings.some(other => ["success", "applying", "submitting", "answers_claimed"].includes(other.status) || hasPotentialSubmission(other))) return true;
  const subjects = [...new Set(siblings.map(other => submissionSubjectKey(row.userId, other.jobId)))];
  return !!await tx.applicationSubmissionReservation.findFirst({ where: { subjectKey: { in: subjects } }, select: { id: true } });
}

async function destinationIsUnique(tx: Prisma.TransactionClient, row: WorkerGateRow, channel: string): Promise<boolean> {
  // Duplicate imported Job rows can target the same ATS posting. Compare the
  // provider, host and posting ID, rather than trusting only internal jobId.
  const others = await tx.application.findMany({ where: { userId: row.userId, id: { not: row.id } }, select: { job: { select: { url: true } } } });
  const destination = (url: string) => continuationDestination(channel, url);
  const target = destination(row.job.url);
  if (!target || others.some(other => destination(other.job.url) === target)) return false;
  const importedJobs = await tx.job.findMany({ where: channel === "portal_greenhouse"
    ? { OR: [{ url: { contains: "greenhouse.io", mode: "insensitive" } }, { url: { contains: "gh_jid=", mode: "insensitive" } }] }
    : { url: { startsWith: new URL(row.job.url).origin, mode: "insensitive" } }, select: { id: true, url: true } });
  const duplicateSubjects = importedJobs.filter(job => job.id !== row.jobId && destination(job.url) === target).map(job => submissionSubjectKey(row.userId, job.id));
  return !duplicateSubjects.length || !await tx.applicationSubmissionReservation.findFirst({ where: { subjectKey: { in: duplicateSubjects } }, select: { id: true } });
}

/** Called only by the audited adapter wrapper after it returned before its sole
 * candidate POST, or Greenhouse's blank-form callback before any personal data.
 * Old NOT_SUBMITTED rows and post-upload pauses get no attestation. */
export async function attestAnswerPause(id: string, token: Date, channel: string, pendingQuestionsJson: string, jobUrl: string, db: DB = prisma, evidence?: PreTransmissionEvidence): Promise<boolean> {
  if (channel !== "portal_recruitee" && !(BLANK_FORM_EVIDENCE[channel] && evidence === BLANK_FORM_EVIDENCE[channel])) return false;
  return (await withLockedApplication(id, db, async (tx, row) => {
    // Rows without per-application consent get a consent-PENDING proof: the
    // candidate's confirmation of these answers on Domande grants it
    // (queueAnswerContinuation). Only blank-form pauses qualify, i.e. nothing
    // reached the portal; Recruitee's post-fill pause still needs prior consent.
    if (!row) return false;
    const consentPending = !row.consentGrantedAt;
    if (consentPending && channel === "portal_recruitee") return false;
    if (!row || row.job.url !== jobUrl || row.status !== "applying" || row.startedAt?.getTime() !== +token
      || row.submitConfirmation !== SUBMISSION_STARTED || rolloutApplicationIneligibility(row)
      || row.submittedAt || row.submittedVia || row.submissionReceiptJson || row.completedAt
      || row.viewedAt || row.lastReplyAt || row.replyCount || row.userStatus) return false;
    let pending: unknown;
    try { pending = JSON.parse(pendingQuestionsJson); } catch { return false; }
    if (!Array.isArray(pending) || !pending.length || pending.length > 100 || pending.some(value => !parseApplicationQuestion(value))) return false;
    const previous = parseAnswerContinuation(row.answerContinuationJson);
    if (row.answerContinuationJson && (!previous || answerContinuationIneligibility({ ...row, status: "ready_to_apply", submitConfirmation: NOT_SUBMITTED }, "running", jobUrl))) return false;
    const proof: AnswerContinuation = {
      version: 1, applicationId: id, userId: row.userId, jobId: row.jobId, jobUrl: row.job.url,
      attemptStartedAt: previous?.attemptStartedAt ?? token.toISOString(), workToken: token.toISOString(), channel,
      consentGrantedAt: consentPending ? null : row.consentGrantedAt!.toISOString(),
      consentSource: consentPending ? "answers" : "explicit", pendingHash: continuationDigest(pendingQuestionsJson),
      pausedAt: new Date().toISOString(), phase: "paused", confirmedAt: null, finalSubmitStarted: false,
      ...(BLANK_FORM_EVIDENCE[channel] ? { preTransmissionEvidence: evidence } : {}),
    };
    if (!await continuationReservationMatches(tx, row, proof)) return false;
    await tx.application.update({ where: { id }, data: {
      status: "needs_answers", submitConfirmation: NOT_SUBMITTED, pendingQuestionsJson,
      answerContinuationJson: JSON.stringify(proof),
    } });
    return true;
  })) === true;
}

/** Authenticated, candidate-confirmed continuation of the same reserved attempt.
 * Only this transition can publish a continuation. No implicit resume on save. */
export async function queueAnswerContinuation(input: {
  applicationId: string; userId: string; proofDigest: string; expectedAnswersJson: string | null;
}, db: DB = prisma): Promise<string> {
  return (await withLockedApplication(input.applicationId, db, async (tx, row) => {
    if (!row || row.userId !== input.userId) return "application_not_found";
    if (!row.answerContinuationJson) return "continuation_proof_missing";
    if (row.userProvidedAnswersJson !== input.expectedAnswersJson) return "questions_changed_reload";
    const proof = parseAnswerContinuation(row.answerContinuationJson);
    // Confirming the answers IS the per-application consent when the proof
    // was recorded consent-pending. Evaluate the current gates as if granted.
    const grantsConsent = proof?.consentGrantedAt === null && proof.consentSource === "answers" && !row.consentGrantedAt;
    const consentAt = grantsConsent ? new Date(Math.max(Date.now(), Date.parse(proof!.pausedAt))) : row.consentGrantedAt;
    const reason = answerContinuationIneligibility(row, "paused", row.job.url) ?? currentWorkerIneligibility({ ...row, consentGrantedAt: consentAt });
    if (reason || !proof) return reason ?? "continuation_proof_missing";
    if (!await continuationReservationMatches(tx, row, proof)) return "continuation_reservation_mismatch";
    if (!await capacityAvailable(tx, row)) return "session_capacity_reached";
    let pending: unknown;
    try { pending = JSON.parse(row.pendingQuestionsJson!); } catch { return "questions_invalid"; }
    if (!Array.isArray(pending) || !pending.length) return "questions_invalid";
    const saved = await tx.userAnswer.findMany({ where: { userId: row.userId, source: "user", answeredAt: { not: null } } });
    const facts = candidateFacts(row.user.cvProfile ? rowToProfile(row.user.cvProfile) : null, row.user, parseAnswers(row.user.preferences?.applicationAnswersJson), saved);
    if (answerConfirmationDigest(row.answerContinuationJson, row.userProvidedAnswersJson, facts) !== input.proofDigest) return "questions_changed_reload";
    for (const value of pending) {
      const question = parseApplicationQuestion(value);
      if (!question) return "questions_invalid";
      const explicit = resolveExplicitApplicationAnswer(row.userProvidedAnswersJson, row.id, question);
      if (explicit.conflict) return "answer_conflict";
      const fact = explicit.answer ? null : resolveCandidateFact(question, { facts });
      const answer = explicit.answer ?? fact?.answer;
      if (!answer || !completesApplicationQuestion(question, answer)) return fact?.conflict ? "answer_conflict" : "answers_incomplete";
    }
    const confirmedAt = grantsConsent ? consentAt!.toISOString() : new Date().toISOString();
    // Compare-and-set on the consent we evaluated: a concurrent grant/revoke reloads.
    const changed = await tx.application.updateMany({ where: { id: row.id, consentGrantedAt: row.consentGrantedAt, answerContinuationJson: row.answerContinuationJson }, data: {
      status: "queued", errorMessage: null,
      ...(grantsConsent ? { consentGrantedAt: consentAt } : {}),
      answerContinuationJson: JSON.stringify({ ...proof, phase: "queued", confirmedAt,
        ...(grantsConsent ? { consentGrantedAt: consentAt!.toISOString(), consentSource: "answers", consentNote: ANSWERS_CONSENT_NOTE } : {}) }),
    } });
    if (changed.count !== 1) return "questions_changed_reload";
    if (grantsConsent) console.log(`[consent] ${row.id} consentGrantedAt=${consentAt!.toISOString()} source=domande_answers`);
    return "queued";
  })) ?? "application_not_found";
}
