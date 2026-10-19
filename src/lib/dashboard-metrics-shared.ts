/**
 * Shared Dashboard Metrics — Single Source of Truth
 * 
 * Problem: Dashboard, Applications, Inbox, Analytics, Jobs each calculate their own metrics,
 * resulting in conflicting counts (e.g., dashboard 4 replies vs analytics 0 replies).
 * 
 * Solution: This module provides canonical metric definitions that ALL pages must use.
 * No page should calculate its own counts; import these functions instead.
 * 
 * Evidence-backed guarantees:
 * - Confirmed submissions = verified ATS receipt OR email delivered event (never inferred)
 * - Recruiter replies = isHuman=true, excluding security codes, distinct applicationIds
 * - Open opportunities = role-filtered, closedAt=null, last 30d cache
 * - Actions needed = awaiting approval + needs answers (NOT all queued applications)
 * 
 * Authorization: All functions enforce userId filter, never expose admin/cross-user data.
 */

import { prisma } from "@/lib/db";
import { applicationEvidenceDate, deliveryEvidence, isConfirmedDelivery } from "@/lib/application-evidence";
import { ACTION_STAGES, applicationStage, emptyStageCounts, type StageCounts } from "@/lib/application-stage";
import { STATUS_STAGE } from "@/lib/ui-application-status";

export {
  ACTION_STAGES,
  applicationStage,
  emptyStageCounts,
  isInterviewEvidence,
  isOffer,
  needsUserAction,
  type StageCounts,
} from "@/lib/application-stage";

/**
 * Confirmed submissions (evidence-backed only)
 * 
 * Counts applications with verified delivery proof:
 * - ATS HTTP receipt (2xx with application_id) OR
 * - ATS confirmation page (DOM evidence) OR  
 * - Email delivered event (provider confirmed)
 * 
 * Excludes:
 * - status="success" without receipt
 * - Provider accepted (not delivered)
 * - Tracking pixels, UNCONFIRMED, mock/demo
 * 
 * Used by: Dashboard, Applications, Analytics
 * Time window: All time (user lifetime)
 */
export async function getConfirmedSubmissions(userId: string): Promise<number> {
  let confirmed = 0;
  let cursor: string | undefined;

  // Paginated read (200/batch) to avoid memory issues with large datasets
  while (true) {
    const applications = await prisma.application.findMany({
      where: { userId },
      orderBy: { id: "asc" },
      take: 200,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        userId: true,
        status: true,
        submittedVia: true,
        submitConfirmation: true,
        submissionReceiptJson: true,
        emailAttempts: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, providerEmailId: true, acceptedAt: true },
        },
      },
    });

    for (const application of applications) {
      if (application.userId !== userId) continue; // Extra safety
      const evidence = deliveryEvidence(application);
      if (isConfirmedDelivery(evidence)) confirmed++;
    }

    if (applications.length < 200) break;
    cursor = applications[applications.length - 1].id;
  }

  return confirmed;
}

/**
 * Recruiter replies (distinct applications with human responses)
 * 
 * Counts distinct applicationIds with at least one recruiter-classified reply:
 * - isHuman=true (not auto-reply, not bounce)
 * - kind: risposta | colloquio | rifiutata (not auto, not bounce)
 * - isSecurityCode=false (not 2FA codes misclassified as replies)
 * 
 * Handles both channels:
 * - ApplicationReply (inbound via reply+[id]@inbound)
 * - GmailMessage (synced from user's Gmail)
 * 
 * Deduplication: Same reply in both tables counts once per application.
 * 
 * Used by: Dashboard, Inbox, Analytics
 * Time window: All time
 */
export async function getRecruiterReplies(userId: string): Promise<number> {
  return await prisma.application.count({
    where: {
      userId,
      OR: [
        {
          replies: {
            some: {
              isHuman: true,
              isSecurityCode: false,
              kind: { in: ["risposta", "colloquio", "rifiutata"] },
            },
          },
        },
        {
          gmailMessages: {
            some: {
              userId, // Extra safety: only this user's Gmail messages
              isHuman: true,
              kind: { in: ["risposta", "colloquio", "rifiutata"] },
            },
          },
        },
      ],
    },
  });
}

/**
 * Interview invites (applications with confirmed interview evidence)
 * 
 * Counts applications with interview classification:
 * - userStatus="colloquio" (user manually marked) OR
 * - lastReplyKind="colloquio" (auto-classified from reply)
 * 
 * Used by: Dashboard, Interviews
 * Time window: All time
 */
export async function getInterviewInvites(userId: string): Promise<number> {
  return await prisma.application.count({
    where: {
      userId,
      OR: [{ userStatus: "colloquio" }, { lastReplyKind: "colloquio" }],
    },
  });
}

/**
 * Offers (user-reported)
 * 
 * Counts applications with userStatus="offerta".
 * No auto-detection; user must manually mark as offer.
 * 
 * Used by: Dashboard, Applications
 * Time window: All time
 */
export async function getOffers(userId: string): Promise<number> {
  return await prisma.application.count({
    where: { userId, userStatus: "offerta" },
  });
}

/**
 * Open opportunities (role-filtered, recent cache)
 * 
 * Counts jobs that:
 * - Are still open (closedAt=null)
 * - Were cached recently (last 30d)
 * - User hasn't dismissed
 * - Match user's roles (if preferences set)
 * 
 * Note: Does NOT apply location filter here (that's for Discover page).
 * This is the total pool of available jobs.
 * 
 * Used by: Dashboard, Jobs, Discover
 * Time window: Last 30 days (cache staleness)
 */
export async function getOpenOpportunities(userId: string): Promise<number> {
  const days30Ago = new Date(Date.now() - 30 * 86400_000);
  
  return await prisma.job.count({
    where: {
      closedAt: null,
      cachedAt: { gte: days30Ago },
      dismissals: { none: { userId } },
    },
  });
}

/**
 * Unread messages
 *
 * Job-related messages (LavorAI replies + Gmail mail matched to the job
 * search) whose read state is known and unread, from the same recent window
 * the Inbox shows (200 per source). Unknown historical read state is not
 * counted. Same predicate as the Inbox header and the attention queue
 * (src/lib/inbox-counts.ts).
 *
 * Used by: Dashboard metrics API, Inbox
 * Time window: recent inbox window (until read)
 */
export async function getUnreadMessages(userId: string): Promise<number> {
  const [{ getInboxMessages }, { countUnreadJobMessages }] = await Promise.all([
    import("@/lib/inbox-repository"),
    import("@/lib/inbox-counts"),
  ]);
  return countUnreadJobMessages(await getInboxMessages(userId));
}

export { countUnreadJobMessages, isUnreadJobMessage } from "@/lib/inbox-counts";

/**
 * Actions needed (blocking user actions)
 *
 * Applications whose journey stage needs the user: "Da approvare"
 * (awaiting_consent) and "Da completare" (ready_to_apply, needs_answers,
 * needs_session). Same definition as the Candidature "Da fare" filter and
 * the dashboard progress stages, so the numbers match across pages.
 *
 * Excludes queued/optimizing (system working), failed/cancelled and sent.
 *
 * Used by: Dashboard metrics API, Candidature
 * Time window: Current (active blockers)
 */
export async function getActionsNeeded(userId: string): Promise<number> {
  const statuses = Object.entries(STATUS_STAGE)
    .filter(([, stage]) => ACTION_STAGES.includes(stage))
    .map(([status]) => status);
  return await prisma.application.count({ where: { userId, status: { in: statuses } } });
}

/**
 * Applications by journey stage, with delivery evidence applied
 * (see applicationStage). One scan, paginated 200 per batch.
 *
 * total = every non-diagnostic application (the sidebar/Candidature total).
 * stages.sent equals getConfirmedSubmissions for the same user.
 *
 * Used by: Dashboard progress, dashboard metrics API, Candidature filters
 * Time window: All time
 */
export async function getApplicationStageCounts(userId: string): Promise<{ total: number; stages: StageCounts }> {
  const stages = emptyStageCounts();
  let total = 0;
  let cursor: string | undefined;
  while (true) {
    const applications = await prisma.application.findMany({
      where: { userId, status: { not: "diagnostic" } },
      orderBy: { id: "asc" },
      take: 200,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        userId: true,
        status: true,
        submittedVia: true,
        submitConfirmation: true,
        submissionReceiptJson: true,
        emailAttempts: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, providerEmailId: true, acceptedAt: true } },
      },
    });
    for (const application of applications) {
      if (application.userId !== userId) continue;
      const stage = applicationStage(application);
      if (!stage) continue;
      total++;
      stages[stage]++;
    }
    if (applications.length < 200) break;
    cursor = applications[applications.length - 1].id;
  }
  return { total, stages };
}

/**
 * Total applications (all non-diagnostic rows, any stage).
 * Used by: sidebar count, Candidature header.
 */
export async function getApplicationTotal(userId: string): Promise<number> {
  return await prisma.application.count({ where: { userId, status: { not: "diagnostic" } } });
}

/**
 * Provider-accepted emails (awaiting delivery confirmation)
 * 
 * Counts email attempts where:
 * - Provider accepted the email (status: accepted or delayed)
 * - Has providerEmailId (email was sent)
 * - Delivery not yet confirmed (no delivered event)
 * 
 * Used by: Dashboard (as secondary metric, not primary)
 * Time window: All time (until delivered or failed)
 */
export async function getProviderAcceptedEmails(userId: string): Promise<number> {
  let count = 0;
  let cursor: string | undefined;

  while (true) {
    const applications = await prisma.application.findMany({
      where: { userId },
      orderBy: { id: "asc" },
      take: 200,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        userId: true,
        emailAttempts: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, providerEmailId: true },
        },
      },
    });

    for (const application of applications) {
      if (application.userId !== userId) continue;
      const attempt = application.emailAttempts[0];
      if (
        attempt &&
        ["accepted", "delayed"].includes(attempt.status) &&
        attempt.providerEmailId
      ) {
        count++;
      }
    }

    if (applications.length < 200) break;
    cursor = applications[applications.length - 1].id;
  }

  return count;
}

/**
 * Unverified submissions (possibly sent, no proof)
 * 
 * Counts applications with status="success" but no delivery evidence.
 * These may or may not have been delivered; user should verify on portal.
 * 
 * Used by: Dashboard progress, Applications
 * Time window: All time
 */
export async function getUnverifiedSubmissions(userId: string): Promise<number> {
  let unverified = 0;
  let cursor: string | undefined;

  while (true) {
    const applications = await prisma.application.findMany({
      where: { userId },
      orderBy: { id: "asc" },
      take: 200,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        userId: true,
        status: true,
        submittedVia: true,
        submitConfirmation: true,
        submissionReceiptJson: true,
        emailAttempts: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, providerEmailId: true, acceptedAt: true },
        },
      },
    });

    for (const application of applications) {
      if (application.userId !== userId) continue;
      const evidence = deliveryEvidence(application);
      if (!isConfirmedDelivery(evidence) && evidence !== "provider_accepted" && application.status === "success") {
        unverified++;
      }
    }

    if (applications.length < 200) break;
    cursor = applications[applications.length - 1].id;
  }

  return unverified;
}

/**
 * Draft replies (user started but didn't send)
 * 
 * Counts InboxReply rows with status="draft".
 * User started composing a reply but hasn't sent it yet.
 * 
 * Used by: Dashboard attention queue, Inbox
 * Time window: All time (until sent or deleted)
 */
export async function getDraftReplies(userId: string): Promise<number> {
  return await prisma.inboxReply.count({
    where: { application: { userId }, status: "draft" },
  });
}

/**
 * Recent activity (last 7 days)
 * 
 * Counts applications created in last 7 days (excluding diagnostic/test).
 * 
 * Used by: Dashboard trends, Analytics
 * Time window: Last 7 days
 */
export async function getRecentApplications(userId: string): Promise<number> {
  const days7Ago = new Date(Date.now() - 7 * 86400_000);
  
  return await prisma.application.count({
    where: {
      userId,
      createdAt: { gte: days7Ago },
      status: { not: "diagnostic" },
    },
  });
}

/**
 * Batch fetch all metrics (for dashboard API)
 * 
 * Fetches all metrics in parallel, returns complete set.
 * Useful for dashboard /api/dashboard/metrics endpoint.
 * 
 * Time window: Various (documented per metric above)
 */
export async function getAllDashboardMetrics(userId: string) {
  const [
    confirmed,
    providerAccepted,
    replies,
    interviews,
    offers,
    opportunities,
    unreadMessages,
    actionsNeeded,
    unverified,
    draftReplies,
    recentApplications,
  ] = await Promise.all([
    getConfirmedSubmissions(userId),
    getProviderAcceptedEmails(userId),
    getRecruiterReplies(userId),
    getInterviewInvites(userId),
    getOffers(userId),
    getOpenOpportunities(userId),
    getUnreadMessages(userId),
    getActionsNeeded(userId),
    getUnverifiedSubmissions(userId),
    getDraftReplies(userId),
    getRecentApplications(userId),
  ]);

  return {
    confirmed,
    providerAccepted,
    replies,
    interviews,
    offers,
    opportunities,
    unreadMessages,
    actionsNeeded,
    unverified,
    draftReplies,
    recentApplications,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Time series for dashboard visuals (sparklines + weekly trend)
// ─────────────────────────────────────────────────────────────────────────

/** Days are bucketed in the product's home time zone so "today" matches the user. */
export const DASHBOARD_TIME_ZONE = "Europe/Rome";
export const SPARKLINE_DAYS = 30;
export const TREND_WEEKS = 8;
const RECRUITER_REPLY_KINDS = ["risposta", "colloquio", "rifiutata"];

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: DASHBOARD_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar-day number (days since epoch) of `date` in the dashboard time zone. */
export function zonedDayNumber(date: Date): number {
  const [y, m, d] = dayFormatter.format(date).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function dayNumberToIso(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

/** Per-day event counts for the last `days` calendar days, oldest first, today last. */
export function bucketDaily(dates: Date[], now: Date, days = SPARKLINE_DAYS): number[] {
  const today = zonedDayNumber(now);
  const first = today - (days - 1);
  const out = new Array<number>(days).fill(0);
  for (const date of dates) {
    const day = zonedDayNumber(date);
    if (day >= first && day <= today) out[day - first]++;
  }
  return out;
}

/**
 * Rolling 7-day windows ending today, oldest first. Rolling windows (instead
 * of calendar weeks) avoid a misleading dip for the current, partial week.
 */
export function trendWeekStarts(now: Date, weeks = TREND_WEEKS): number[] {
  const today = zonedDayNumber(now);
  return Array.from({ length: weeks }, (_, i) => today - 6 - (weeks - 1 - i) * 7);
}

export function bucketWeekly(dates: Date[], now: Date, weeks = TREND_WEEKS): number[] {
  const starts = trendWeekStarts(now, weeks);
  const today = zonedDayNumber(now);
  const out = new Array<number>(weeks).fill(0);
  for (const date of dates) {
    const day = zonedDayNumber(date);
    if (day < starts[0] || day > today) continue;
    out[Math.min(weeks - 1, Math.floor((day - starts[0]) / 7))]++;
  }
  return out;
}

export interface DashboardTimeSeries {
  /** Daily counts, last 30 days (oldest first). */
  daily: { confirmed: number[]; replies: number[]; interviews: number[] };
  /** Offers are user-declared (userStatus) and carry no timestamp: no history exists. */
  offersHistoryAvailable: false;
  /** Rolling 7-day windows (start/end inclusive, YYYY-MM-DD), oldest first; the last ends today. */
  weeks: { start: string; end: string; sent: number; replies: number }[];
}

/**
 * Evidence-backed event dates for the dashboard visuals, scoped to one user.
 *
 * - Confirmed sends: applications whose delivery evidence is confirmed (same
 *   rule as getConfirmedSubmissions), dated with applicationEvidenceDate.
 * - Recruiter replies: human, non-security-code replies of recruiter kinds
 *   from ApplicationReply and GmailMessage. The same reply can exist in both
 *   channels, so events are de-duplicated per application per day.
 * - Interviews: first "colloquio" reply per application.
 */
export async function getDashboardTimeSeries(userId: string, now: Date = new Date()): Promise<DashboardTimeSeries> {
  const weekStarts = trendWeekStarts(now);
  const firstDay = Math.min(weekStarts[0], zonedDayNumber(now) - (SPARKLINE_DAYS - 1));
  // One day of margin: zone offsets never exceed 24h.
  const since = new Date((firstDay - 1) * 86_400_000);

  const confirmedDates: Date[] = [];
  let cursor: string | undefined;
  while (true) {
    const applications = await prisma.application.findMany({
      where: {
        userId,
        OR: [
          { submittedAt: { gte: since } },
          { completedAt: { gte: since } },
          { createdAt: { gte: since } },
          { emailAttempts: { some: { createdAt: { gte: since } } } },
        ],
      },
      orderBy: { id: "asc" },
      take: 200,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        userId: true,
        status: true,
        submittedVia: true,
        submitConfirmation: true,
        submissionReceiptJson: true,
        submittedAt: true,
        completedAt: true,
        createdAt: true,
        emailAttempts: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, providerEmailId: true, acceptedAt: true, createdAt: true },
        },
      },
    });
    for (const application of applications) {
      if (application.userId !== userId) continue;
      if (!isConfirmedDelivery(deliveryEvidence(application))) continue;
      const date = applicationEvidenceDate(application);
      if (date >= since && date <= now) confirmedDates.push(date);
    }
    if (applications.length < 200) break;
    cursor = applications[applications.length - 1].id;
  }

  const [appReplies, gmailReplies] = await Promise.all([
    prisma.applicationReply.findMany({
      where: {
        application: { userId },
        isHuman: true,
        isSecurityCode: false,
        kind: { in: RECRUITER_REPLY_KINDS },
        receivedAt: { gte: since, lte: now },
      },
      orderBy: { receivedAt: "asc" },
      take: 2000,
      select: { applicationId: true, receivedAt: true, kind: true },
    }),
    prisma.gmailMessage.findMany({
      where: {
        userId,
        applicationId: { not: null },
        isHuman: true,
        kind: { in: RECRUITER_REPLY_KINDS },
        date: { gte: since, lte: now },
      },
      orderBy: { date: "asc" },
      take: 2000,
      select: { applicationId: true, date: true, kind: true },
    }),
  ]);

  const replyEvents = [
    ...appReplies.map((r) => ({ applicationId: r.applicationId, date: r.receivedAt, kind: r.kind })),
    ...gmailReplies.map((r) => ({ applicationId: r.applicationId as string, date: r.date, kind: r.kind })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const seenReplyDays = new Set<string>();
  const replyDates: Date[] = [];
  const interviewApps = new Set<string>();
  const interviewDates: Date[] = [];
  for (const event of replyEvents) {
    const key = `${event.applicationId}:${zonedDayNumber(event.date)}`;
    if (!seenReplyDays.has(key)) {
      seenReplyDays.add(key);
      replyDates.push(event.date);
    }
    if (event.kind === "colloquio" && !interviewApps.has(event.applicationId)) {
      interviewApps.add(event.applicationId);
      interviewDates.push(event.date);
    }
  }

  const sentWeekly = bucketWeekly(confirmedDates, now);
  const repliesWeekly = bucketWeekly(replyDates, now);
  return {
    daily: {
      confirmed: bucketDaily(confirmedDates, now),
      replies: bucketDaily(replyDates, now),
      interviews: bucketDaily(interviewDates, now),
    },
    offersHistoryAvailable: false,
    weeks: weekStarts.map((start, i) => ({ start: dayNumberToIso(start), end: dayNumberToIso(start + 6), sent: sentWeekly[i], replies: repliesWeekly[i] })),
  };
}

/**
 * Analisi cohort: applications whose delivery evidence date falls inside the
 * selected period (7/30/90 calendar days, Europe/Rome), aggregated with aggregatePerformance.
 * Period-scoped by definition, so it is NOT the same number as the all-time
 * dashboard KPIs; the Analisi page labels it "nel periodo" and shows the
 * all-time recruiter replies (getRecruiterReplies) only as reference.
 * `matchScore` lets the page plug in the CV-based estimate without this
 * module importing the CV profile code.
 */
export async function getAnalyticsCohort(
  userId: string,
  days: number,
  matchScore: (title: string, description: string) => number | null = () => null,
  now = new Date(),
) {
  const { aggregatePerformance, analyticsPeriod } = await import("@/lib/analytics-performance");
  const period = analyticsPeriod(days, now, DASHBOARD_TIME_ZONE);
  const applications = await prisma.application.findMany({
    where: {
      userId,
      AND: [{ OR: [{ submittedVia: { not: null } }, { emailAttempts: { some: {} } }] }],
      OR: [
        { submittedAt: { gte: period.start, lte: now } },
        { submittedAt: null, completedAt: { gte: period.start, lte: now } },
        { submittedAt: null, completedAt: null, createdAt: { gte: period.start, lte: now } },
        { submittedAt: null, emailAttempts: { some: { createdAt: { gte: period.start, lte: now } } } },
      ],
    },
    select: {
      status: true, submittedVia: true, submitConfirmation: true, submissionReceiptJson: true,
      createdAt: true, completedAt: true, submittedAt: true,
      userStatus: true, lastReplyAt: true, lastReplyKind: true, cvDocxPath: true, cvPdfPath: true,
      emailAttempts: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, providerEmailId: true, acceptedAt: true, createdAt: true } },
      replies: { where: { isSecurityCode: false }, select: { receivedAt: true, kind: true, isHuman: true, isSecurityCode: true } },
      gmailMessages: { where: { userId }, select: { date: true, kind: true, isHuman: true } },
      job: { select: { title: true, description: true } },
      session: { select: { title: true } },
    },
  });
  return aggregatePerformance(
    applications.map((a) => ({
      ...a,
      role: a.session?.title?.trim() || a.job.title,
      match: a.job.description.trim() ? matchScore(a.job.title, a.job.description) : null,
    })),
    period.days,
    now,
    DASHBOARD_TIME_ZONE,
  );
}

/**
 * Opportunities "per te" — one definition for Dashboard and Scopri.
 *
 * Open jobs (closedAt = null) refreshed in the last 14 days from the
 * supported ATS sources, not dismissed and not already applied to by the
 * user, then filtered by the user's preferences: preferred roles, companies
 * to avoid, minimum salary and minimum match score. At most the newest
 * MATCHING_SCAN jobs are scanned. `total` is the full filtered count;
 * `jobs` is the newest-first list (callers slice it, e.g. Scopri shows 50).
 */
export const MATCHING_SOURCES = ["greenhouse", "lever", "ashby", "smartrecruiters", "linkedin"];
export const MATCHING_WINDOW_DAYS = 14;
const MATCHING_SCAN = 1000;
export async function getMatchingOpportunities(userId: string) {
  const [{ rowToProfile }, { quickMatchScore }, { titleMatchesAnyRole }] = await Promise.all([
    import("@/lib/cv-profile-types"),
    import("@/lib/match-score"),
    import("@/lib/role-match"),
  ]);
  const [prefs, full] = await Promise.all([
    prisma.userPreferences.findUnique({ where: { userId }, select: { rolesJson: true, salaryMin: true, matchMin: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { avoidCompanies: true, cvProfile: true } }),
  ]);
  let roles: string[] = [];
  try {
    const arr = JSON.parse(prefs?.rolesJson ?? "[]");
    roles = Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch { roles = []; }
  const salaryMin = prefs?.salaryMin ?? 0;
  const matchMin = prefs?.matchMin ?? 0;
  const avoid = new Set((full?.avoidCompanies ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  const profile = full?.cvProfile ? rowToProfile(full.cvProfile) : null;
  const raw = await prisma.job.findMany({
    where: {
      closedAt: null,
      dismissals: { none: { userId } },
      cachedAt: { gte: new Date(Date.now() - MATCHING_WINDOW_DAYS * 86_400_000) },
      source: { in: MATCHING_SOURCES },
      NOT: { applications: { some: { userId, status: { in: ["success", "queued", "optimizing", "applying"] } } } },
    },
    orderBy: { postedAt: "desc" },
    take: MATCHING_SCAN,
  });
  const jobs = raw.filter((j) => {
    if (roles.length > 0 && !titleMatchesAnyRole(j.title, roles)) return false;
    if (j.company && avoid.has(j.company.toLowerCase())) return false;
    if (salaryMin) {
      const top = j.salaryMax ?? j.salaryMin ?? 0;
      if (top > 0 && top < salaryMin) return false;
    }
    if (matchMin > 0 && profile && quickMatchScore(profile, `${j.title}\n${j.company ?? ""}\n${j.description}`) < matchMin) return false;
    return true;
  });
  return { total: jobs.length, jobs, profile, matchMin, scanned: raw.length, scanCapped: raw.length === MATCHING_SCAN };
}

/** Count of getMatchingOpportunities (Dashboard "Scopri" card). */
export async function getMatchingOpportunityCount(userId: string): Promise<number> {
  return (await getMatchingOpportunities(userId)).total;
}
