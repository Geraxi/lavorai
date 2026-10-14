import { applicationsPaused } from "@/lib/application-pause";
import type { Prisma, PrismaClient } from "@prisma/client";
import { autoApplyPreferenceMismatch, parsePreferenceList, isAvoidedCompany } from "@/lib/auto-apply-preferences";
import { rowToProfile } from "@/lib/cv-profile-types";
import { quickMatchScore } from "@/lib/match-score";
import { titleMatchesAnyRole } from "@/lib/role-match";
import { parseVerifiedSubmissionReceipt, receiptJobId } from "@/lib/submission-receipt";
import { prisma } from "@/lib/db";
import { isApplicationAccessPaused, isLifetimeProPlus, requiresPaymentMethodBeforeApp } from "@/lib/billing";

// Persisted before crossing a delivery boundary. A crash/timeout never releases
// this reservation: only a proved no-send outcome or an atomic success does.
export const SUBMISSION_STARTED = "SUBMISSION_STARTED";
export const NOT_SUBMITTED = "NOT_SUBMITTED";
export const WORK_RESERVED_STATUSES = ["optimizing", "applying", "submitting", "ready_to_apply", "awaiting_consent", "needs_answers", "needs_session"];
const evidenceSelect = {
  submittedAt: true, submittedVia: true, submitConfirmation: true, canaryLog: true,
  answersUsedJson: true, viewedAt: true, lastReplyAt: true, replyCount: true, userStatus: true,
} as const;
export const workerGateSelect = {
  id: true, userId: true, jobId: true, sessionId: true, status: true, startedAt: true, consentGrantedAt: true,
  cvDocxPath: true, ...evidenceSelect,
  job: { select: { closedAt: true, url: true, company: true, title: true, description: true, location: true,
    remote: true, contractType: true, salaryMin: true, salaryMax: true } },
  session: { select: { id: true, userId: true, status: true, sentCount: true, targetCount: true, title: true, label: true } },
  user: { select: {
    email: true, tier: true, createdAt: true, trialEndsAt: true, trialGraceEndsAt: true,
    subscriptionStatus: true, currentPeriodEnd: true, pausedUntil: true, suspendedAt: true,
    emailVerified: true, privacyConsentAt: true, avoidCompanies: true,
    cvProfile: { select: { firstName: true, lastName: true, email: true, phone: true, city: true, title: true, summary: true,
      experiencesJson: true, educationJson: true, skillsJson: true, languagesJson: true, linksJson: true } },
    preferences: { select: { autoApplyMode: true, rolesJson: true, locationsJson: true,
      employmentType: true, salaryMin: true, matchMin: true } },
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
  const user = row.user;
  if (user.suspendedAt) return "user_suspended";
  if (!user.emailVerified || !user.privacyConsentAt) return "consent_or_verification_missing";
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
  const identity = await db.application.findUnique({ where: { id }, select: { userId: true, sessionId: true } });
  if (!identity) return null;
  return db.$transaction(async (tx) => {
    // Shared with retry admission and all worker delivery paths. Row locks also
    // serialize ordinary pause/billing/consent changes at this decision point.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${identity.userId}))`;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${identity.userId} FOR UPDATE`;
    if (identity.sessionId) await tx.$queryRaw`SELECT id FROM "ApplicationSession" WHERE id = ${identity.sessionId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "UserPreferences" WHERE "userId" = ${identity.userId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Application" WHERE id = ${id} FOR UPDATE`;
    const row = await tx.application.findUnique({ where: { id }, select: workerGateSelect });
    // Changing ownership/round while admission waits needs a fresh invocation.
    if (row && (row.userId !== identity.userId || row.sessionId !== identity.sessionId)) return null;
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

function heldMessage(reason: string): string {
  const explanations: Record<string, string> = {
    auto_apply_not_enabled: "Consenso specifico non verificabile nella modalità corrente",
    session_inactive: "Round in pausa, concluso o annullato",
    session_capacity_reached: "Limite del round occupato da invii o candidature ancora in attesa",
    user_suspended: "Account sospeso",
    consent_or_verification_missing: "Verifica email o consenso privacy da completare",
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
    if (!row || row.status !== "queued") return null;
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
    if (siblings.some((other) => other.status === "success" || WORK_RESERVED_STATUSES.includes(other.status)
      || hasPotentialSubmission(other) || (other.status === "failed" && other.cvDocxPath))) {
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
export async function beginApplicationSubmission(id: string, token: Date, db: DB = prisma): Promise<boolean> {
  return (await withLockedApplication(id, db, async (tx, row) => {
    if (!row || row.startedAt?.getTime() !== token.getTime()
      || !["optimizing", "ready_to_apply"].includes(row.status) || hasPotentialSubmission(row)) return false;
    const reason = currentWorkerIneligibility(row);
    if (reason || !await capacityAvailable(tx, row)) {
      await tx.application.update({ where: { id }, data: {
        status: "queued", startedAt: new Date(), submitConfirmation: NOT_SUBMITTED,
        errorMessage: heldMessage(reason ?? "session_capacity_reached"),
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
export async function recheckApplicationSubmission(id: string, token: Date, db: DB = prisma): Promise<boolean> {
  return (await withLockedApplication(id, db, async (tx, row) => {
    if (!row || row.startedAt?.getTime() !== token.getTime()
      || row.status !== "applying" || row.submitConfirmation !== SUBMISSION_STARTED) return false;
    const reason = currentWorkerIneligibility(row);
    if (reason || !await capacityAvailable(tx, row)) {
      await tx.application.update({ where: { id }, data: {
        status: "ready_to_apply", submitConfirmation: "UNCONFIRMED",
        errorMessage: `Invio finale interrotto: ${reason ?? "session_capacity_reached"}. Il portale potrebbe aver già ricevuto dati o allegati. Verifica l'esito prima di un nuovo tentativo.`,
      } });
      return false;
    }
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
    }, data: { ...data, status: "success" } });
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
