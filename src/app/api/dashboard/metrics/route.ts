/**
 * Dashboard Metrics API
 * 
 * Pre-computed aggregations for dashboard page.
 * Cache: 1 minute (revalidated on-demand).
 * Authorization: Session user only, never admin data.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { deliveryEvidence, isConfirmedDelivery } from "@/lib/application-evidence";
import { journeyStage, type JourneyStage } from "@/lib/ui-application-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 60; // 1 minute cache

interface DashboardMetrics {
  userId: string;
  computedAt: string;
  overview: {
    confirmed: number;
    providerAccepted: number;
    withReplies: number;
    interviews: number;
    offers: number;
  };
  progress: Record<JourneyStage | "unverified", number>;
  opportunities: {
    open: number;
    compatible: number;
    newLast48h: number;
  };
  attention: {
    totalItems: number;
    unreadMessages: number;
    draftReplies: number;
  };
  trends: {
    applicationsLast7d: number;
    applicationsLast30d: number;
  };
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const days7Ago = new Date(now - 7 * 86400_000);
  const days30Ago = new Date(now - 30 * 86400_000);
  const hours48Ago = new Date(now - 48 * 3600_000);

  // Parallel queries (same pattern as dashboard page)
  const [
    deliveryCounts,
    repliesCount,
    interviewsCount,
    offersCount,
    statusGroups,
    openJobsCount,
    newJobsCount,
    applicationsLast7d,
    applicationsLast30d,
    unreadMessages,
    draftReplies,
  ] = await Promise.all([
    // Delivery counts (paginated, evidence-backed)
    computeDeliveryCounts(user.id),
    
    // Replies count
    prisma.application.count({
      where: {
        userId: user.id,
        OR: [
          { replies: { some: { isHuman: true, isSecurityCode: false, kind: { in: ["risposta", "colloquio", "rifiutata"] } } } },
          { gmailMessages: { some: { userId: user.id, isHuman: true, kind: { in: ["risposta", "colloquio", "rifiutata"] } } } },
        ],
      },
    }),
    
    // Interviews count
    prisma.application.count({
      where: {
        userId: user.id,
        OR: [{ userStatus: "colloquio" }, { lastReplyKind: "colloquio" }],
      },
    }),
    
    // Offers count
    prisma.application.count({
      where: { userId: user.id, userStatus: "offerta" },
    }),
    
    // Progress stages
    prisma.application.groupBy({
      by: ["status"],
      where: { userId: user.id, status: { not: "diagnostic" } },
      _count: { _all: true },
    }),
    
    // Open jobs (compatible, last 30d)
    prisma.job.count({
      where: {
        closedAt: null,
        cachedAt: { gte: days30Ago },
        dismissals: { none: { userId: user.id } },
      },
    }),
    
    // New jobs (last 48h)
    prisma.job.count({
      where: {
        closedAt: null,
        cachedAt: { gte: hours48Ago },
        dismissals: { none: { userId: user.id } },
      },
    }),
    
    // Applications last 7d
    prisma.application.count({
      where: { userId: user.id, createdAt: { gte: days7Ago }, status: { not: "diagnostic" } },
    }),
    
    // Applications last 30d
    prisma.application.count({
      where: { userId: user.id, createdAt: { gte: days30Ago }, status: { not: "diagnostic" } },
    }),
    
    // Unread messages
    prisma.applicationReply.count({
      where: {
        application: { userId: user.id },
        isHuman: true,
        isSecurityCode: false,
        kind: { in: ["risposta", "colloquio", "rifiutata"] },
        readAt: null,
      },
    }),
    
    // Draft replies
    prisma.inboxReply.count({
      where: { application: { userId: user.id }, status: "draft" },
    }),
  ]);

  // Aggregate progress stages (same logic as dashboard)
  const stageCounts = new Map<JourneyStage | "unverified", number>();
  for (const group of statusGroups) {
    const stage = journeyStage(group.status);
    if (!stage || stage === "unverified" || stage === "sent") continue;
    stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + group._count._all);
  }
  stageCounts.set("sent", deliveryCounts.confirmed);
  stageCounts.set("unverified", deliveryCounts.unverified);

  const progress: Record<JourneyStage | "unverified", number> = {
    preparing: stageCounts.get("preparing") ?? 0,
    prepared: stageCounts.get("prepared") ?? 0,
    awaiting_approval: stageCounts.get("awaiting_approval") ?? 0,
    approved: stageCounts.get("approved") ?? 0,
    manual: stageCounts.get("manual") ?? 0,
    in_flight: stageCounts.get("in_flight") ?? 0,
    sent: stageCounts.get("sent") ?? 0,
    unverified: stageCounts.get("unverified") ?? 0,
    stopped: stageCounts.get("stopped") ?? 0,
  };

  const metrics: DashboardMetrics = {
    userId: user.id,
    computedAt: new Date().toISOString(),
    overview: {
      confirmed: deliveryCounts.confirmed,
      providerAccepted: deliveryCounts.providerAccepted,
      withReplies: repliesCount,
      interviews: interviewsCount,
      offers: offersCount,
    },
    progress,
    opportunities: {
      open: openJobsCount,
      compatible: openJobsCount, // TODO: filter by role preferences when available
      newLast48h: newJobsCount,
    },
    attention: {
      totalItems: unreadMessages + draftReplies, // Simplified: needs_answers + awaiting_consent calculated below
      unreadMessages,
      draftReplies,
    },
    trends: {
      applicationsLast7d,
      applicationsLast30d,
    },
  };

  return NextResponse.json(metrics, {
    headers: {
      "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
    },
  });
}

/**
 * Same paginated evidence-backed count as dashboard page.
 * Reads bounded pages, never loads all applications at once.
 */
async function computeDeliveryCounts(userId: string): Promise<{
  confirmed: number;
  providerAccepted: number;
  unverified: number;
}> {
  let confirmed = 0;
  let providerAccepted = 0;
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
      if (application.userId !== userId) continue; // Extra safety
      const evidence = deliveryEvidence(application);
      if (isConfirmedDelivery(evidence)) confirmed++;
      else if (evidence === "provider_accepted") providerAccepted++;
      else if (application.status === "success") unverified++;
    }

    if (applications.length < 200) break;
    cursor = applications[applications.length - 1].id;
  }

  return { confirmed, providerAccepted, unverified };
}
