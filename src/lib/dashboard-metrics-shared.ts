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
 * Unread messages (attention queue count)
 * 
 * Counts ApplicationReply messages that:
 * - Are from recruiters (isHuman=true)
 * - Are not security codes (isSecurityCode=false)
 * - Are relevant kinds (risposta, colloquio, rifiutata)
 * - Have not been read (readAt=null)
 * 
 * Used by: Dashboard attention queue, Inbox
 * Time window: All time (until read)
 */
export async function getUnreadMessages(userId: string): Promise<number> {
  return await prisma.applicationReply.count({
    where: {
      application: { userId },
      isHuman: true,
      isSecurityCode: false,
      kind: { in: ["risposta", "colloquio", "rifiutata"] },
      readAt: null,
    },
  });
}

/**
 * Actions needed (blocking user actions)
 * 
 * Counts applications that require user intervention:
 * - Awaiting approval (status: awaiting_consent)
 * - Needs answers (status: needs_answers with pending questions)
 * 
 * Excludes:
 * - Queued/optimizing (system is working, user doesn't need to act)
 * - Failed/cancelled (already stopped, no action possible)
 * - Success/sent (already submitted, no action needed)
 * 
 * Used by: Dashboard attention queue, Questions
 * Time window: Current (active blockers)
 */
export async function getActionsNeeded(userId: string): Promise<number> {
  const [awaitingApproval, needsAnswers] = await Promise.all([
    prisma.application.count({
      where: { userId, status: "awaiting_consent" },
    }),
    prisma.application.count({
      where: {
        userId,
        status: "needs_answers",
        pendingQuestionsJson: { not: null }, // Has actual questions to answer
      },
    }),
  ]);

  return awaitingApproval + needsAnswers;
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
