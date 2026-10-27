import { providerOfferAllowed } from "./application-provider-policy";
import { createLivenessGate, livenessMaxChecksFromEnv, type LivenessGate } from "@/lib/auto-apply-liveness-gate";
import { checkJobUrlLiveness, markJobClosed } from "@/lib/job-liveness";
import { automaticApplicationsBlocked } from "@/lib/application-rollout";
import { applicationsPaused } from "@/lib/application-pause";
import { autoApplyPreferenceMismatch, parsePreferenceList, isAvoidedCompany, locationPreferenceMismatch } from "@/lib/auto-apply-preferences";
import { prisma } from "@/lib/db";
import { monthlyQuotaSince } from "@/lib/admin-user-actions";
import { rowToProfile } from "@/lib/cv-profile-types";
import { quickMatchScore } from "@/lib/match-score";
import { roleTitleTokenGroups, titleTokenWhere } from "@/lib/role-query";
import { searchRoleTitles } from "@/lib/auto-apply-roles";
import { DESCRIPTION_SOURCES, fillMissingDescriptions, needsFullDescription } from "@/lib/scrapers/posting-description";

/** Public detail fetches to fill empty descriptions: per user, per run, and time. */
const DESCRIPTION_BACKFILL_PER_USER = 15;
const DESCRIPTION_BACKFILL_PER_RUN = 60;
const DESCRIPTION_BACKFILL_BUDGET_MS = 20_000;
import { enqueueApplication } from "@/lib/application-queue";
import { resolveSession } from "@/lib/apply-session";
import { dailyApplicationLimit, effectiveTier, getLimits, freeWeeklyApplyQuota, hasPaidOrTrialApplicationAccess, usesFreeWeeklyQuota } from "@/lib/billing";
import { titleMatchesAnyRole } from "@/lib/role-match";
import { runSelfHeal } from "@/lib/auto-apply-self-heal";
import { recordConversionEvent } from "@/lib/conversion-events";
import { AnalyticsEvent } from "@/lib/analytics";
import { resolveBoardListingsForRoles } from "@/lib/board-apply-resolver";
import { sortByPaidPriority } from "@/lib/paid-priority";
import { compareJobsForAutoApply, isSkippedPortalUrl, SKIPPED_ATS_MANUAL_MESSAGE } from "@/lib/ats-skip-hosts";
import { lookupPublishedSkipListInbox } from "@/lib/skip-list-email-lookup";
import { skipListEmailSendDecision } from "@/lib/recruiter-email-fallback";
import { companyCapUsageWhere, countDailyCapUsage, countsTowardQuota, monthlyQuotaUsageWhere, weeklyQuotaUsageWhere } from "@/lib/daily-application-cap";
import { usesProvenChannelFilter } from "@/lib/proven-channels";
import { deployedAppVersion } from "@/lib/deployed-version";
import {
  GREENHOUSE_FORM_FETCH_BUDGET,
  buildProvenChannelFactContext,
  evaluateProvenChannelEligibility,
  type ProvenChannelUserContext,
} from "@/lib/proven-channel-eligibility";

/**
 * Auto-apply cron: per ogni utente con autoApplyMode="auto", scova job
 * compatibili e accoda candidature SENZA richiedere un'azione manuale.
 *
 * Guardrail:
 *  - solo mode=auto
 *  - rispetta il cap giornaliero effettivo (Free in prova: max 5/giorno)
 *  - score >= matchMin (già nel profilo)
 *  - aziende escluse → skip
 *  - job già candidati → skip (dedup su userId+jobId)
 *  - session.status=paused → skip
 *  - alla fine della prova Free il motore si ferma (account view-only)
 *  - cap globale per run: 5 candidature per utente (per non saturare la coda)
 */

const PER_USER_RUN_CAP = 5;

/** Età massima (giorni) di un annuncio per l'auto-apply. Env AUTO_APPLY_MAX_JOB_AGE_DAYS (1-365, default 30). */
export const DEFAULT_MAX_JOB_AGE_DAYS = 30;
export function maxJobAgeDays(env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env): number {
  const n = Number.parseInt(env.AUTO_APPLY_MAX_JOB_AGE_DAYS ?? "", 10);
  return Number.isFinite(n) && n >= 1 && n <= 365 ? n : DEFAULT_MAX_JOB_AGE_DAYS;
}
/** Filtro Prisma: job aperto e recente. Senza postedAt si usa cachedAt (prima vista). */
export function jobFreshnessWhere(now = new Date(), days = maxJobAgeDays()) {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  return {
    closedAt: null,
    OR: [
      { postedAt: { gte: cutoff } },
      { postedAt: null, cachedAt: { gte: cutoff } },
    ],
  };
}
/** Total wall-clock for board apply-link lookups in one cron run. */
const BOARD_RESOLUTION_RUN_BUDGET_MS = 60_000;
/** Same, for a single-user (onboarding) run. */
const BOARD_RESOLUTION_USER_BUDGET_MS = 15_000;

function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export { expandLocationPref, jobMatchesLocationPrefs, autoApplyPreferenceMismatch } from "@/lib/auto-apply-preferences";

export interface RunStats {
  usersProcessed: number;
  applicationsEnqueued: number;
  applicationsHandedOff: number;
  applicationsHeld: number;
  applicationsAwaitingConsent: number;
  skippedDailyCap: number;
  skippedMonthlyPaywall: number;
  skippedFreeWeeklyQuota: number;
  skippedMatchThreshold: number;
  skippedRoleMismatch: number;
  skippedAlreadyApplied: number;
  skippedAvoidedCompany: number;
  skippedSessionPaused: number;
  skippedEmploymentMismatch: number;
  skippedLocationMismatch: number;
  skippedLocationUnverified: number;
  skippedSalaryMismatch: number;
  skippedJobClosed: number;
  skippedManualAts: number;
  skippedUnprovenChannel: number;
  candidatesFetched: number;
  descriptionsBackfilled: number;
  errors: number;
  attempted: number;
  accepted: number;
  failed: number;
  blockedByReason: Record<string, number>;
  awaitingAction: number;
  deployedVersion: string;
}

function emptyRunStats(): RunStats {
  return {
    usersProcessed: 0,
    applicationsEnqueued: 0,
    applicationsHandedOff: 0,
    applicationsHeld: 0,
    applicationsAwaitingConsent: 0,
    skippedDailyCap: 0,
    skippedMonthlyPaywall: 0,
    skippedFreeWeeklyQuota: 0,
    skippedMatchThreshold: 0,
    skippedRoleMismatch: 0,
    skippedAlreadyApplied: 0,
    skippedAvoidedCompany: 0,
    skippedSessionPaused: 0,
    skippedEmploymentMismatch: 0,
    skippedLocationMismatch: 0,
    skippedLocationUnverified: 0,
    skippedSalaryMismatch: 0,
    skippedJobClosed: 0,
    skippedManualAts: 0,
    skippedUnprovenChannel: 0,
    candidatesFetched: 0,
    descriptionsBackfilled: 0,
    errors: 0,
    attempted: 0,
    accepted: 0,
    failed: 0,
    blockedByReason: {},
    awaitingAction: 0,
    deployedVersion: deployedAppVersion(),
  };
}

/** Honest outcome counters for cron/admin. Enqueue-only until a drain is merged. */
export function finalizeRunStats(stats: RunStats): RunStats {
  const blockedByReason: Record<string, number> = {};
  const add = (reason: string, n: number) => { if (n) blockedByReason[reason] = (blockedByReason[reason] ?? 0) + n; };
  add("free_weekly_quota_reached", stats.skippedFreeWeeklyQuota);
  add("daily_quota_reached", stats.skippedDailyCap);
  add("billing_ineligible", stats.skippedMonthlyPaywall);
  add("job_closed", stats.skippedJobClosed);
  add("unproven_channel", stats.skippedUnprovenChannel);
  add("preference_match_threshold", stats.skippedMatchThreshold);
  add("preference_role", stats.skippedRoleMismatch);
  add("preference_location", stats.skippedLocationMismatch);
  add("preference_location_unverified", stats.skippedLocationUnverified);
  add("preference_employment", stats.skippedEmploymentMismatch);
  add("preference_salary", stats.skippedSalaryMismatch);
  add("company_avoided", stats.skippedAvoidedCompany);
  add("session_paused", stats.skippedSessionPaused);
  add("already_applied", stats.skippedAlreadyApplied);
  add("manual_ats", stats.skippedManualAts);
  stats.attempted = stats.applicationsEnqueued + stats.applicationsHandedOff
    + stats.applicationsHeld + stats.applicationsAwaitingConsent;
  stats.accepted = 0;
  stats.failed = stats.errors;
  stats.blockedByReason = blockedByReason;
  stats.awaitingAction = stats.applicationsHandedOff + stats.applicationsAwaitingConsent;
  stats.deployedVersion = deployedAppVersion();
  return stats;
}

function newLivenessGate(): LivenessGate {
  return createLivenessGate({ check: checkJobUrlLiveness, markClosed: markJobClosed, maxChecks: livenessMaxChecksFromEnv() });
}

export async function runAutoApplyCron(): Promise<RunStats> {
  if (applicationsPaused() || automaticApplicationsBlocked()) return finalizeRunStats(emptyRunStats());
  // Self-heal PRIMA di processare gli utenti: archivia sessioni garbage,
  // re-enqueue safe stuck apps, preserve user matchMin, alert
  // admin su credit exhaustion. Idempotente, gira ogni tick (~30min).
  try {
    const heal = await runSelfHeal();
    if (
      heal.garbageSessionsArchived +
        heal.stuckAppsRequeued +
        heal.matchMinAutoLowered.length +
        heal.creditExhaustedUsers.length >
      0
    ) {
      console.log("[auto-apply-cron] self-heal report", heal);
    }
  } catch (err) {
    console.error("[auto-apply-cron] self-heal crashed (non-fatal)", err);
  }

  const stats = emptyRunStats();
  // One bounded liveness budget per cron run, shared by all users.
  const livenessGate = newLivenessGate();

  // Utenti in modalità auto O hybrid con CV + preferenze.
  // - "auto":   creiamo candidature "queued" e le mandiamo subito in coda.
  // - "hybrid": creiamo candidature "awaiting_consent" — il motore trova e
  //             prepara i job, l'utente li approva dal dashboard. Senza
  //             questo, hybrid era di fatto morto (zero candidature mai).
  const eligibleUsers = await prisma.user.findMany({
    where: {
      suspendedAt: null,
      emailVerified: { not: null },
      onboardedAt: { not: null },
      seniority: { not: null },
      englishLevel: { not: null },
      noticePeriod: { not: null },
      preferences: {
        is: {
          autoApplyMode: { in: ["auto", "hybrid"] },
          rolesJson: { not: "[]" },
          locationsJson: { not: "[]" },
          sourcesJson: { not: "[]" },
        },
      },
      cvDocuments: { some: {} },
      cvProfile: { isNot: null },
    },
    select: {
      id: true,
      email: true,
      tier: true,
      subscriptionStatus: true,
      currentPeriodEnd: true,
      trialEndsAt: true, trialGraceEndsAt: true,
      createdAt: true,
      avoidCompanies: true,
      quotaResetAt: true,
      preferences: {
        select: {
          autoApplyMode: true,
          matchMin: true,
          dailyCap: true,
          rolesJson: true,
          locationsJson: true,
          salaryMin: true,
          employmentType: true,
          protectedCategory: true,
          sourcesJson: true,
        },
      },
      cvProfile: true,
    },
  });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Board apply-link lookups share one bounded budget across the whole run
  // (route maxDuration is 300s); later users simply skip new lookups.
  const resolutionDeadline = Date.now() + BOARD_RESOLUTION_RUN_BUDGET_MS;
  // Paid Pro/Pro+ and active trials go first: the liveness-check budget and the
  // board-resolution deadline are shared per run, so later users can be starved.
  const orderedUsers = sortByPaidPriority(eligibleUsers, (u) => u, (u) => u.createdAt);
  for (const user of orderedUsers) {
    try {
      stats.usersProcessed++;
      await processUser(user, stats, todayStart, monthStart, resolutionDeadline, livenessGate);
    } catch (err) {
      console.error(`[auto-apply-cron] user ${user.id} errored`, err);
      stats.errors++;
    }
  }

  // Daily summary: al termine, invia un'email onesta a ogni utente con
  // attività nelle 24h ("N inviate + N preparate"). Idempotente lato
  // destinatario (cooldown 24h nella funzione). Fire-and-forget: se
  // fallisce non blocca il return dei RunStats.
  try {
    const { runDailySummary } = await import("@/lib/daily-summary");
    const dailyRes = await runDailySummary({});
    console.log(
      `[auto-apply-cron] daily-summary: sent=${dailyRes.sent} skipped=${dailyRes.skipped} errors=${dailyRes.errors}`,
    );
  } catch (err) {
    console.error("[auto-apply-cron] daily-summary failed (non-fatal)", err);
  }

  return finalizeRunStats(stats);
}

/**
 * Trigger auto-apply per un singolo utente ora — usato dall'onboarding
 * per dare esperienza tangibile ("prime 3 candidature in 2 min") invece
 * di far aspettare il cron notturno. Idempotente: rispetta gli stessi
 * cap giornalieri/mensili + già-candidato del cron principale.
 *
 * Ritorna gli stats parziali solo per questo utente (utile per la UI
 * che mostra "N candidature accodate").
 */
export async function runAutoApplyForUser(userId: string): Promise<RunStats> {
  if (applicationsPaused() || automaticApplicationsBlocked()) return finalizeRunStats(emptyRunStats());
  const stats = emptyRunStats();
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
      suspendedAt: null,
      emailVerified: { not: null },
      onboardedAt: { not: null },
      seniority: { not: null },
      englishLevel: { not: null },
      noticePeriod: { not: null },
      preferences: {
        is: {
          autoApplyMode: { in: ["auto", "hybrid"] },
          rolesJson: { not: "[]" },
          locationsJson: { not: "[]" },
          sourcesJson: { not: "[]" },
        },
      },
      cvDocuments: { some: {} },
      cvProfile: { isNot: null },
    },
    select: {
      id: true,
      email: true,
      tier: true,
      subscriptionStatus: true,
      currentPeriodEnd: true,
      trialEndsAt: true, trialGraceEndsAt: true,
      createdAt: true,
      avoidCompanies: true,
      quotaResetAt: true,
      preferences: {
        select: {
          autoApplyMode: true,
          matchMin: true,
          dailyCap: true,
          rolesJson: true,
          locationsJson: true,
          salaryMin: true,
          employmentType: true,
          protectedCategory: true,
          sourcesJson: true,
        },
      },
      cvProfile: true,
    },
  });
  if (!user || !user.preferences || !user.cvProfile) return finalizeRunStats(stats);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  try {
    stats.usersProcessed = 1;
    await processUser(user, stats, todayStart, monthStart, Date.now() + BOARD_RESOLUTION_USER_BUDGET_MS, newLivenessGate());
  } catch (err) {
    console.error(`[runAutoApplyForUser] ${userId} errored`, err);
    stats.errors++;
  }
  return finalizeRunStats(stats);
}

async function processUser(
  user: {
    id: string;
    email: string;
    tier: string;
    subscriptionStatus?: string | null;
    currentPeriodEnd?: Date | null;
    trialEndsAt: Date | null;
    trialGraceEndsAt: Date | null;
    createdAt: Date;
    avoidCompanies: string | null;
    preferences: {
      autoApplyMode: string;
      matchMin: number;
      dailyCap: number;
      rolesJson: string;
      locationsJson: string;
      salaryMin: number;
      employmentType: string;
      protectedCategory?: boolean;
    } | null;
    cvProfile: Parameters<typeof rowToProfile>[0] | null;
  },
  stats: RunStats,
  todayStart: Date,
  monthStart: Date,
  resolutionDeadline: number,
  livenessGate: LivenessGate = newLivenessGate(),
): Promise<void> {
  if (!user.preferences || !user.cvProfile) return;
  const prefs = user.preferences;
  const profile = rowToProfile(user.cvProfile);
  if (!profile.title && !profile.summary && !profile.skills.length && !profile.experiences.length) return;

  const restrictProven = usesProvenChannelFilter(user.id);
  const formBudget = { remaining: GREENHOUSE_FORM_FETCH_BUDGET };
  let provenCtx: ProvenChannelUserContext | null = null;
  if (restrictProven) {
    const extra = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        name: true,
        yearsExperience: true,
        englishLevel: true,
        noticePeriod: true,
        privacyConsentAt: true,
        preferences: { select: { applicationAnswersJson: true, locationsJson: true } },
        answers: {
          where: { source: "user", answeredAt: { not: null } },
          select: { label: true, answer: true, kind: true, optionsJson: true, source: true, answeredAt: true },
        },
      },
    });
    provenCtx = {
      factContext: buildProvenChannelFactContext({
        profile: user.cvProfile,
        user: {
          email: user.email,
          name: extra?.name,
          yearsExperience: extra?.yearsExperience,
          englishLevel: extra?.englishLevel,
          noticePeriod: extra?.noticePeriod,
          privacyConsentAt: extra?.privacyConsentAt,
        },
        applicationAnswersJson: extra?.preferences?.applicationAnswersJson,
        locationsJson: extra?.preferences?.locationsJson,
        savedAnswers: extra?.answers ?? [],
      }),
      hasCv: true,
    };
  }

  const admitProven = async (job: {
    url: string;
    sourceSlug?: string | null;
    company?: string | null;
    recruiterEmail?: string | null;
  }): Promise<boolean> => {
    if (!restrictProven || !provenCtx) return true;
    const verdict = await evaluateProvenChannelEligibility(
      {
        url: job.url,
        sourceSlug: job.sourceSlug,
        company: job.company,
        recruiterEmail: job.recruiterEmail,
      },
      { ...provenCtx, factContext: { ...provenCtx.factContext, company: job.company } },
      { formBudget },
    );
    if (!verdict.ok) {
      stats.skippedUnprovenChannel++;
      return false;
    }
    return true;
  };

  // Modalità: "auto" candida direttamente (queued + enqueue), "hybrid"
  // prepara la candidatura e la lascia in "awaiting_consent" perché
  // l'utente la approvi dal dashboard. initialStatus guida entrambi i
  // create-block sotto.
  const isHybrid = prefs.autoApplyMode === "hybrid";
  const initialStatus = isHybrid ? "awaiting_consent" : "queued";

  // Round attivi (sessioni status=active|auto, non completate). I "round"
  // sono la nuova source-of-truth: ognuno ha un title + targetCount.
  // Fallback legacy: se l'utente non ha sessioni attive, leggiamo
  // preferences.rolesJson come prima (back-compat per account
  // pre-refactor). I nuovi utenti useranno solo le sessioni.
  const activeSessions = await prisma.applicationSession.findMany({
    where: {
      userId: user.id,
      status: { in: ["active", "auto"] },
    },
    select: {
      id: true,
      title: true,
      label: true,
      targetCount: true,
      sentCount: true,
      customContext: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Ruoli da cercare: preferences.rolesJson (ruoli salvati) e basta; i titoli
  // delle sessioni attive servono solo da fallback filtrato se rolesJson è
  // vuoto (vedi auto-apply-roles). Le sessioni restano per il tracking
  // (sentCount/targetCount); i ruoli senza sessione usano resolveSession().
  const rolesSet = searchRoleTitles(prefs.rolesJson, activeSessions);
  const sessionByRole = new Map<string, (typeof activeSessions)[number]>();
  for (const s of activeSessions) {
    if (s.sentCount >= s.targetCount) continue;
    const key = (s.title ?? s.label).trim().toLowerCase();
    if (rolesSet.has(key)) sessionByRole.set(key, s);
  }

  const roles: string[] = Array.from(rolesSet.values());
  if (roles.length === 0) return;

  // Malformed or missing geographic preferences require review, never a wider search.
  const locationPrefs = parsePreferenceList(prefs.locationsJson);
  if (!locationPrefs?.length) return;

  // Daily cap = sent today or currently in flight (queued/claimed/sending).
  // needs_answers, CAPTCHA / finish-it-yourself, NOT_SUBMITTED do not count.
  // The day boundary is Europe/Rome, not UTC midnight.
  const todayCount = await countDailyCapUsage(prisma, user.id);
  // Accesso pagato/prova: limiti storici (giornaliero + mensile del tier).
  // Altrimenti (Free a prova scaduta, prova senza carta, past_due/canceled):
  // quota gratuita di N candidature su 7 giorni mobili, vedi billing.ts.
  let remainingToday: number;
  if (hasPaidOrTrialApplicationAccess(user)) {
    const dailyLimit = dailyApplicationLimit(user, prefs.dailyCap);
    remainingToday = Math.max(0, dailyLimit - todayCount);
    if (remainingToday === 0) {
      stats.skippedDailyCap++;
      stats.applicationsHeld++;
      return;
    }

    // Paywall mensile (Pro/Pro+)
    const tier = effectiveTier(user);
    const limits = getLimits(tier);
    if (limits.monthlyApplications !== Infinity) {
      const monthCount = await prisma.application.count({
        where: monthlyQuotaUsageWhere(
          user.id,
          monthlyQuotaSince((user as { quotaResetAt?: Date | null }).quotaResetAt ?? null),
        ),
      });
      const remainingMonth = Math.max(
        0,
        limits.monthlyApplications - monthCount,
      );
      if (remainingMonth === 0) {
        stats.skippedMonthlyPaywall++;
        return;
      }
      remainingToday = Math.min(remainingToday, remainingMonth);
    }
  } else {
    if (!usesFreeWeeklyQuota(user)) {
      stats.skippedMonthlyPaywall++;
      return;
    }
    const weekCount = await prisma.application.count({
      where: weeklyQuotaUsageWhere(user.id),
    });
    remainingToday = Math.max(0, freeWeeklyApplyQuota() - weekCount);
    if (remainingToday === 0) {
      stats.skippedFreeWeeklyQuota++;
      stats.applicationsHeld++;
      return;
    }
  }

  // Cap globale per run
  remainingToday = Math.min(remainingToday, PER_USER_RUN_CAP);



  // Board link-out (We Work Remotely, Arbeitnow): follow the public apply
  // link and promote a supported ATS posting to its canonical ATS row, which
  // the query below then treats like any other ATS job. Bounded per run and
  // cached on the board row; the board row itself is never a candidate.
  // Kill switch: BOARD_APPLY_RESOLUTION=false (read inside the resolver).
  try {
    const resolution = await resolveBoardListingsForRoles(roles, { limit: 6, deadline: resolutionDeadline });
    if (resolution.promoted) console.log(`[auto-apply-cron] user ${user.id} board listings promoted to ATS`, resolution);
  } catch (err) {
    console.warn("[auto-apply-cron] board resolution failed (non-fatal)", err instanceof Error ? err.message : err);
  }

  // Job candidati: match su titoli per ciascun ruolo, fonti Greenhouse/Lever
  // (quelli con URL ATS diretto — submit reale funziona). Adzuna è troppo
  // fragile per auto-apply senza intervento utente.
  // EURES and weworkremotely are EXCLUDED: their ToS conflict with automated
  // application (EURES forbids non-partner extraction; WWR requires application
  // through their site).
  const jobs = await prisma.job.findMany({
    where: {
      closedAt: null,
      // "linkedin" = job scovato da Apify il cui applyUrl è già stato
      // filtrato a un ATS supportato (vedi linkedin-apify.ts), quindi
      // il submit avviene sul form Greenhouse/Lever/Workable/BambooHR
      // originale — zero automazione su linkedin.com.
      // Adzuna è anti-bot blocked (Cloudflare): page.goto su adzuna.*
      // va in timeout 30s, ogni job sprecato. Solo source nativi.
      source: {
        in: [
          "greenhouse",
          "lever",
          "ashby",
          "workable",
          "smartrecruiters",
          "linkedin",
          "recruitee",
          "personio",
          "teamtailor",
          "bamboohr",
          "breezy",
          "pinpoint",
        ],
        // `ats_test` is excluded: restricted test destinations never enter
        // the customer auto-apply pool.
        // Board sources (weworkremotely, arbeitnow, etc.) and ToS-restricted
        // sources (eures) are not included in the pool: they're either resolved
        // to their canonical ATS posting via board-apply-resolver or disabled.
      },
      // URL canoniche vanilla: gli adapter Playwright funzionano solo
      // sui domini ATS noti. Aziende con career page custom
      // (es. stripe.com/jobs) falliscono sempre → skip.
      // Custom Greenhouse career pages with gh_jid parameter are also eligible
      // (the adapter will canonicalize them to boards.greenhouse.io).
      OR: [
        { url: { contains: "boards.greenhouse.io" } },
        { url: { contains: "job-boards.greenhouse.io" } },
        { url: { contains: "?gh_jid=" } }, // Custom career pages linking to Greenhouse
        { url: { contains: "jobs.lever.co" } },
        { url: { contains: "workable.com/j/" } },
        { url: { contains: "apply.workable.com" } },
        { url: { contains: "jobs.ashbyhq.com" } },
        { url: { contains: "ashbyhq.com" } },
        { url: { contains: "jobs.smartrecruiters.com" } },
        { url: { contains: "careers.smartrecruiters.com" } },
        { url: { contains: ".recruitee.com" } },
        { url: { contains: "/o/" } },
        { url: { contains: "jobs.personio." } },
        { url: { contains: ".teamtailor.com" } },
        { url: { contains: "/jobs/" } },
        { url: { contains: ".bamboohr.com/careers/" } },
        { url: { contains: ".breezy.hr/p/" } },
        { url: { contains: ".pinpointhq.com/postings/" } },
      ],
      // Match title largo: per ogni ruolo, title deve contenere TUTTI
      // i token significativi (≥3 char). Es: "Product Designer" matcha
      // "Senior Product Designer", "Product Design Lead", "Designer
      // Product Innovation". Il post-filter titleMatchesAnyRole con
      // stemming garantisce ulteriore precisione.
      AND: [
        // Staleness: annunci vecchi sono quasi sempre chiusi ("Annuncio non
        // più online"): non sprecare crediti AI né quota giornaliera.
        jobFreshnessWhere(),
        {
          OR: roleTitleTokenGroups(roles).map((toks) => ({
            AND: toks.map(titleTokenWhere),
          })),
        },
      ],
      // Skip any job for which the user already has ANY application row.
      // The worker (reserveApplicationWork) refuses to process a second row
      // for the same user+job (sibling check + immutable submission ledger),
      // and automatic retries are suspended (historicalRetriesBlocked). Creating
      // such a duplicate here only burns a daily/monthly quota slot and leaves
      // a claimed, never-sent "queued" row. Previously only success/queued/
      // optimizing/applying/awaiting_consent or rows < 12h old were excluded,
      // so failed / needs_answers / ready_to_apply rows re-entered the pool
      // after 12h and produced exactly these dead duplicates.
      NOT: {
        applications: { some: { userId: user.id } },
      },
    },
    orderBy: { postedAt: "desc" },
    take: 200, // pesca largo, poi diversifichiamo per azienda lato app
  });

  stats.candidatesFetched += jobs.length;
  if (jobs.length === 0) return;

  // Lazy description backfill: empty or legacy-truncated (exactly 2,000 chars)
  // rows score on company intro only. Greenhouse/Ashby/Lever public APIs now
  // included. Only jobs that can still pass (title matches a role), bounded.
  const backfillLimit = Math.min(DESCRIPTION_BACKFILL_PER_USER, DESCRIPTION_BACKFILL_PER_RUN - stats.descriptionsBackfilled);
  if (backfillLimit > 0) {
    const eligible = jobs.filter((j) => needsFullDescription(j.description) && DESCRIPTION_SOURCES.has(j.source)
      && titleMatchesAnyRole(j.title, roles));
    try {
      const filled = await fillMissingDescriptions(eligible, {
        limit: backfillLimit, concurrency: 4, timeoutMs: 8_000,
        deadline: Date.now() + DESCRIPTION_BACKFILL_BUDGET_MS,
      });
      for (const j of filled) {
        await prisma.job.update({
          where: { id: j.id },
          data: { description: j.description, descriptionFetchedAt: new Date() },
        }).catch(() => {});
      }
      stats.descriptionsBackfilled += filled.length;
    } catch (err) {
      console.warn("[auto-apply-cron] description backfill failed (non-fatal)", err);
    }
  }

  // Diversificazione: per ogni candidatura già consegnata dall'utente,
  // contiamo quanti invii ha già ricevuto ciascuna azienda. Sortiamo i
  // job in base a (a) candidature passate verso quell'azienda ASC, poi
  // (b) postedAt DESC. Così le aziende mai contattate finiscono prima,
  // e Intercom (20 invii) finisce in fondo. Naturale, niente cap rigido.
  const pastByCompany = await prisma.application.groupBy({
    by: ["jobId"],
    where: { userId: user.id, status: "success" },
    _count: { _all: true },
  });
  const pastJobIds = pastByCompany.map((r) => r.jobId);
  const pastJobs =
    pastJobIds.length > 0
      ? await prisma.job.findMany({
          where: { id: { in: pastJobIds } },
          select: { company: true },
        })
      : [];
  const companyApplyCount = new Map<string, number>();
  for (const j of pastJobs) {
    const c = (j.company ?? "").toLowerCase();
    if (!c) continue;
    companyApplyCount.set(c, (companyApplyCount.get(c) ?? 0) + 1);
  }

  // Pre-calcola match score per ogni job → prima chiave di sort.
  // Diamo prima all'utente i job più congrui al suo profilo (CV + ruoli),
  // così se la quota giornaliera si esaurisce non sprechiamo slot sui
  // match deboli. A parità di score prevalgono i tie-break aziende
  // meno contattate (diversificazione) e postedAt più recente.
  const roleProfileForScore = profile;
  const scoreCache = new Map<string, number>();
  const scoreOf = (j: (typeof jobs)[number]): number => {
    let s = scoreCache.get(j.id);
    if (s === undefined) {
      s = quickMatchScore(
        roleProfileForScore,
        `${j.title}\n${j.company ?? ""}\n${j.description}`,
      );
      scoreCache.set(j.id, s);
    }
    return s;
  };

  jobs.sort((a, b) => {
    // 0. Categorie protette: se l'utente è iscritto (L. 68/99), gli annunci
    //    riservati vengono prima di tutto (sono pochi e a bassa concorrenza).
    if (prefs.protectedCategory) {
      const pa = a.protectedCategory ? 1 : 0;
      const pb = b.protectedCategory ? 1 : 0;
      if (pa !== pb) return pb - pa;
    }
    // 0b. Recruiter-email and captcha-free Greenhouse/Lever/Workable/Recruitee first.
    const delivery = compareJobsForAutoApply(a, b);
    if (delivery) return delivery;
    // 1. Match score DESC (più congruo prima)
    const sb = scoreOf(b);
    const sa = scoreOf(a);
    if (sb !== sa) return sb - sa;
    // 1b. Location is a soft ranking signal (never a reject).
    const locRank = (j: typeof a) => {
      const r = locationPreferenceMismatch(j, locationPrefs);
      return r === null ? 0 : r === "location_unverified" ? 1 : 2;
    };
    const la = locRank(a);
    const lb = locRank(b);
    if (la !== lb) return la - lb;
    // 2. Aziende mai contattate prima (diversificazione)
    const ca = companyApplyCount.get((a.company ?? "").toLowerCase()) ?? 0;
    const cb = companyApplyCount.get((b.company ?? "").toLowerCase()) ?? 0;
    if (ca !== cb) return ca - cb;
    // 3. Job più recenti (freschezza)
    const ta = a.postedAt?.getTime() ?? 0;
    const tb = b.postedAt?.getTime() ?? 0;
    return tb - ta;
  });

  // Blacklist aziende strutturalmente non submittabili: 5+ ready_to_apply
  // negli ultimi 30 giorni MA SOLO contando RTA su URL ATS supportati
  // (Greenhouse/Lever/Workable). Le RTA da fallimenti Adzuna timeout
  // non contano: era un problema di resolver, non di company.
  const recentRta = await prisma.application.findMany({
    where: {
      userId: user.id,
      status: "ready_to_apply",
      createdAt: { gte: new Date(Date.now() - 30 * 86400_000) },
      job: {
        OR: [
          { url: { contains: "boards.greenhouse.io" } },
          { url: { contains: "job-boards.greenhouse.io" } },
          { url: { contains: "jobs.lever.co" } },
          { url: { contains: "workable.com/j/" } },
          { url: { contains: "apply.workable.com" } },
        ],
      },
    },
    select: { job: { select: { company: true } } },
  });
  const rtaByCompany = new Map<string, number>();
  for (const r of recentRta) {
    const c = (r.job.company ?? "").toLowerCase();
    if (!c) continue;
    rtaByCompany.set(c, (rtaByCompany.get(c) ?? 0) + 1);
  }
  // Temporaneamente disabilitata mentre debuggo l'adapter Greenhouse
  // (SumUp restituisce ready_to_apply ma URL è vanilla Greenhouse).
  // Riattiveremo dopo aver isolato la causa.
  const blacklistedCompanies = new Set<string>();
  void rtaByCompany;

  // Hard cap per company nel rolling window 30gg.
  // Senza questo, una company con 60 job aperti (es. Wunderman, Dropbox)
  // si prendeva 20+ candidature mentre 50+ altre aziende non vedevano
  // niente.
  //
  // Alzato da 3 → 6: a 3 il pool si esauriva dopo ~30 giorni (ogni
  // azienda matchante saturata, skippedAvoidedCompany dominava il
  // funnel → 0 candidature/giorno). 6 ruoli DIVERSI nella stessa
  // azienda in un mese non è spam — sono posizioni distinte, il
  // recruiting di team diversi non si parla. Raddoppia l'headroom
  // sotto cap senza degradare la qualità percepita dal recruiter.
  const COMPANY_CAP_30D = 6;
  const recentByCompany30d = await prisma.application.groupBy({
    by: ["jobId"],
    where: companyCapUsageWhere(user.id, new Date(Date.now() - 30 * 86400_000)),
    _count: { _all: true },
  });
  const recentJobIds30d = recentByCompany30d.map((r) => r.jobId);
  const recentJobs30d =
    recentJobIds30d.length > 0
      ? await prisma.job.findMany({
          where: { id: { in: recentJobIds30d } },
          select: { company: true },
        })
      : [];
  const companyCount30d = new Map<string, number>();
  for (const j of recentJobs30d) {
    const c = (j.company ?? "").toLowerCase();
    if (!c) continue;
    companyCount30d.set(c, (companyCount30d.get(c) ?? 0) + 1);
  }

  // Per-run: max 1 candidatura per azienda nel primo passaggio, poi
  // se ci sono ancora slot riapriamo. Garantisce che 5 invii in un run
  // tocchino 5 aziende diverse quando possibile.
  const usedThisRun = new Set<string>();
  let enqueued = 0;
  for (const job of jobs) {
    if (!providerOfferAllowed(job.url)) continue;
    if (enqueued >= remainingToday) break;
    const cKey = (job.company ?? "").toLowerCase();
    if (cKey && usedThisRun.has(cKey)) continue; // pass 1: skip duplicates
    // Hard cap 30gg: max COMPANY_CAP_30D per azienda
    if (cKey && (companyCount30d.get(cKey) ?? 0) >= COMPANY_CAP_30D) {
      stats.skippedAvoidedCompany++;
      continue;
    }
    void cKey;

    const preferenceMismatch = autoApplyPreferenceMismatch(job, prefs, locationPrefs);
    if (preferenceMismatch) {
      if (preferenceMismatch === "salary") stats.skippedSalaryMismatch++;
      if (preferenceMismatch === "employment") stats.skippedEmploymentMismatch++;
      continue;
    }

    // Match STRETTO sul titolo: tutti i token significativi del ruolo
    // devono essere presenti. "Product Designer" → sì "Senior Product
    // Designer", no "Product Engineer".
    if (!titleMatchesAnyRole(job.title, roles)) {
      stats.skippedRoleMismatch++;
      continue;
    }

    // Azienda esclusa esplicitamente?
    if (isAvoidedCompany(job.company, user.avoidCompanies)) {
      stats.skippedAvoidedCompany++;
      continue;
    }

    // Azienda blacklisted (3+ ready_to_apply negli ultimi 30gg)?
    if (
      job.company &&
      blacklistedCompanies.has(job.company.toLowerCase())
    ) {
      stats.skippedAvoidedCompany++;
      continue;
    }

    // Desired roles are search intent, not CV experience or evidence of fit.
    const score = quickMatchScore(
      profile,
      `${job.title}\n${job.company ?? ""}\n${job.description}`,
    );
    if (prefs.matchMin > 0 && score < prefs.matchMin) {
      stats.skippedMatchThreshold++;
      continue;
    }

    // Trova la sessione (round) a cui appartiene questo job. Se è
    // partito da un round attivo (sessionByRole popolato), usa quello.
    // Altrimenti fallback al vecchio resolveSession (backward compat).
    let sessionId: string;
    let sessionStatus: string;
    const matchedRoundRole = roles.find((r) =>
      job.title.toLowerCase().includes(r.toLowerCase()),
    );
    const matchedRound = matchedRoundRole
      ? sessionByRole.get(matchedRoundRole.toLowerCase())
      : null;
    if (matchedRound) {
      sessionId = matchedRound.id;
      sessionStatus = "active";
      // Hard cap: se il round è già al target, salta
      if (matchedRound.sentCount >= matchedRound.targetCount) {
        continue;
      }
    } else {
      const legacy = await resolveSession(user.id, {
        title: job.title,
        category: job.category,
      });
      sessionId = legacy.id;
      sessionStatus = legacy.status;
    }
    if (sessionStatus === "paused") {
      stats.skippedSessionPaused++;
      continue;
    }

    // Never queue or ask consent for a posting the company already closed.
    if (await livenessGate.verdict(job) === "closed") {
      stats.skippedJobClosed++;
      continue;
    }
    if (!(await admitProven(job))) continue;

    const portal = portalOf(job.url);

    try {
      const outcome = await admitAutoApplyApplication({
        userId: user.id,
        job,
        portal,
        initialStatus,
        isHybrid,
        score,
        sessionId,
        stats,
      });
      // Handoffs (skip-list ATS, CAPTCHA) and later liveness holds must not
      // consume the per-user daily slot, 30-day company cap, or session target.
      if (outcome !== "slot") continue;
      enqueued++;
      // Marca azienda usata nel run (diversificazione)
      const usedKey = (job.company ?? "").toLowerCase();
      if (usedKey) {
        usedThisRun.add(usedKey);
        // Aggiorna counter 30d in-memory così multi-run consecutivi
        // rispettano il cap senza dover ri-leggere il DB.
        companyCount30d.set(usedKey, (companyCount30d.get(usedKey) ?? 0) + 1);
      }
      // Bump sentCount in-memory così entro lo stesso run il cap
      // targetCount è rispettato. (Il counter persistito viene aggiornato
      // dal worker on-success.)
      if (matchedRound) {
        matchedRound.sentCount = (matchedRound.sentCount ?? 0) + 1;
      }
    } catch (err) {
      console.error(
        `[auto-apply-cron] user ${user.id} job ${job.id} create failed`,
        err,
      );
      stats.errors++;
    }
  }

  // Pass 2: se non abbiamo riempito il cap (poche aziende uniche nel
  // pool), allenta il vincolo e ammetti ripetizioni.
  if (enqueued < remainingToday) {
    for (const job of jobs) {
    if (!providerOfferAllowed(job.url)) continue;
      if (enqueued >= remainingToday) break;
      if (autoApplyPreferenceMismatch(job, prefs, locationPrefs)) continue;
      // Salta job già processati nel pass 1 (rate-limited per company)
      // — verifichiamo via "applications.some" come per gli altri filtri.
      if (!titleMatchesAnyRole(job.title, roles)) continue;
      if (isAvoidedCompany(job.company, user.avoidCompanies)) continue;
      // Cap 30gg anche nel pass 2: senza questo, riprenderemmo le
      // company già viste pass 1.
      const cKey2 = (job.company ?? "").toLowerCase();
      if (cKey2 && (companyCount30d.get(cKey2) ?? 0) >= COMPANY_CAP_30D)
        continue;

      const score = quickMatchScore(
        profile,
        `${job.title}\n${job.company ?? ""}\n${job.description}`,
      );
      if (prefs.matchMin > 0 && score < prefs.matchMin) continue;

      // Salta se già candidato a questo job (pass 1)
      const exists = await prisma.application.findFirst({
        where: { userId: user.id, jobId: job.id },
        select: { id: true },
      });
      if (exists) continue;

      const matchedRoundRole = roles.find((r) =>
        job.title.toLowerCase().includes(r.toLowerCase()),
      );
      const matchedRound = matchedRoundRole
        ? sessionByRole.get(matchedRoundRole.toLowerCase())
        : null;
      let sessionId: string;
      if (matchedRound) {
        if (matchedRound.sentCount >= matchedRound.targetCount) continue;
        sessionId = matchedRound.id;
      } else {
        const legacy = await resolveSession(user.id, {
          title: job.title,
          category: job.category,
        });
        if (legacy.status === "paused") continue;
        sessionId = legacy.id;
      }

      if (await livenessGate.verdict(job) === "closed") {
        stats.skippedJobClosed++;
        continue;
      }
      if (!(await admitProven(job))) continue;

      try {
        const outcome = await admitAutoApplyApplication({
          userId: user.id,
          job,
          portal: portalOf(job.url),
          initialStatus,
          isHybrid,
          score,
          sessionId,
          stats,
        });
        if (outcome !== "slot") continue;
        enqueued++;
        if (cKey2) {
          companyCount30d.set(cKey2, (companyCount30d.get(cKey2) ?? 0) + 1);
        }
        if (matchedRound) {
          matchedRound.sentCount = (matchedRound.sentCount ?? 0) + 1;
        }
      } catch (err) {
        console.error(
          `[auto-apply-cron] pass2 user ${user.id} job ${job.id} failed`,
          err,
        );
        stats.errors++;
      }
    }
  }
}

type AdmitJob = {
  id: string;
  url: string;
  company: string | null;
  description?: string | null;
  recruiterEmail?: string | null;
  recruiterEmailSourceUrl?: string | null;
  companyWebsite?: string | null;
};

/** Skip-list jobs get a cheap inbox lookup first. A miss is a handoff and does not occupy dailyCap. */
async function admitAutoApplyApplication(input: {
  userId: string;
  job: AdmitJob;
  portal: string;
  initialStatus: string;
  isHybrid: boolean;
  score: number;
  sessionId: string;
  stats: RunStats;
}): Promise<"slot" | "handoff" | "consent"> {
  const job = input.job;
  if (isSkippedPortalUrl(job.url)) {
    const found = typeof lookupPublishedSkipListInbox === "function"
      ? await lookupPublishedSkipListInbox(job)
      : null;
    if (found) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          recruiterEmail: found.email,
          recruiterEmailSourceUrl: found.provenance.sourceUrl,
          recruiterScrapedAt: new Date(),
        },
      }).catch(() => undefined);
      job.recruiterEmail = found.email;
    }
    const decision = found ? skipListEmailSendDecision(found, job) : null;
    if (!found || !decision?.ok) {
      await prisma.application.create({
        data: {
          userId: input.userId,
          jobId: job.id,
          portal: input.portal,
          status: "ready_to_apply",
          trackingToken: randomToken(),
          atsScore: input.score,
          sessionId: input.sessionId,
          errorMessage: SKIPPED_ATS_MANUAL_MESSAGE,
          ...(decision && !decision.ok ? { sendFailureReason: decision.reason } : {}),
          completedAt: new Date(),
          recruiterEmailRecheckedAt: new Date(),
        },
      });
      input.stats.skippedManualAts++;
      input.stats.applicationsHandedOff++;
      return "handoff";
    }
  }

  const app = await prisma.application.create({
    data: {
      userId: input.userId,
      jobId: job.id,
      portal: input.portal,
      status: input.initialStatus,
      trackingToken: randomToken(),
      atsScore: input.score,
      sessionId: input.sessionId,
    },
  });
  await recordConversionEvent(AnalyticsEvent.APPLICATION_CREATED, {
    userId: input.userId,
    properties: { mode: input.isHybrid ? "hybrid" : "auto", consentRequired: input.isHybrid },
    dedupeKey: `application_created:${app.id}`,
  });
  if (!input.isHybrid) {
    await enqueueApplication(app.id);
    if (countsTowardQuota(app) && app.status === "queued") input.stats.applicationsEnqueued++;
    else input.stats.applicationsHandedOff++;
  } else {
    input.stats.applicationsAwaitingConsent++;
  }
  if (!countsTowardQuota(app)) return input.isHybrid ? "consent" : "handoff";
  return "slot";
}

function portalOf(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("greenhouse")) return "greenhouse";
  if (u.includes("lever.co")) return "lever";
  if (u.includes("workable.com")) return "workable";
  if (u.includes("ashbyhq.com")) return "ashby";
  if (u.includes("smartrecruiters.com")) return "smartrecruiters";
  if (u.includes("recruitee.com") || /\/o\/[^/]+/.test(u)) return "recruitee";
  if (u.includes("breezy.hr")) return "breezy";
  if (u.includes("pinpointhq.com")) return "pinpoint";
  if (u.includes("personio.")) return "personio";
  if (u.includes("teamtailor.com")) return "teamtailor";
  if (u.includes("bamboohr.com")) return "bamboohr";
  if (u.includes("linkedin")) return "linkedin";
  if (u.includes("indeed")) return "indeed";
  if (u.includes("infojobs")) return "infojobs";
  return "other";
}
