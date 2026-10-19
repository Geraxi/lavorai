/**
 * Dashboard Metrics API
 * 
 * Pre-computed aggregations for dashboard page.
 * Cache: 1 minute (revalidated on-demand).
 * Authorization: Session user only, never admin data.
 * 
 * Uses shared metric definitions from @/lib/dashboard-metrics-shared
 * to ensure consistency with dashboard page, applications, inbox, analytics.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { journeyStage, type JourneyStage } from "@/lib/ui-application-status";
import {
  getAllDashboardMetrics,
  getUnreadMessages,
  getDraftReplies,
} from "@/lib/dashboard-metrics-shared";

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
  const days30Ago = new Date(now - 30 * 86400_000);
  const hours48Ago = new Date(now - 48 * 3600_000);

  // Use shared metrics for consistency across dashboard, applications, inbox, analytics
  const [
    sharedMetrics,
    statusGroups,
    newJobsCount,
    unreadCount,
    drafts,
  ] = await Promise.all([
    getAllDashboardMetrics(user.id),
    
    // Progress stages (computed here as it's UI-specific grouping)
    prisma.application.groupBy({
      by: ["status"],
      where: { userId: user.id, status: { not: "diagnostic" } },
      _count: { _all: true },
    }),
    
    // New jobs (last 48h)
    prisma.job.count({
      where: {
        closedAt: null,
        cachedAt: { gte: hours48Ago },
        dismissals: { none: { userId: user.id } },
      },
    }),
    
    getUnreadMessages(user.id),
    getDraftReplies(user.id),
  ]);

  // Aggregate progress stages (same logic as dashboard)
  const stageCounts = new Map<JourneyStage | "unverified", number>();
  for (const group of statusGroups) {
    const stage = journeyStage(group.status);
    if (!stage || stage === "unverified" || stage === "sent") continue;
    stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + group._count._all);
  }
  stageCounts.set("sent", sharedMetrics.confirmed);
  stageCounts.set("unverified", sharedMetrics.unverified);

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
      confirmed: sharedMetrics.confirmed,
      providerAccepted: sharedMetrics.providerAccepted,
      withReplies: sharedMetrics.replies,
      interviews: sharedMetrics.interviews,
      offers: sharedMetrics.offers,
    },
    progress,
    opportunities: {
      open: sharedMetrics.opportunities,
      compatible: sharedMetrics.opportunities,
      newLast48h: newJobsCount,
    },
    attention: {
      totalItems: unreadCount + drafts + sharedMetrics.actionsNeeded,
      unreadMessages: unreadCount,
      draftReplies: drafts,
    },
    trends: {
      applicationsLast7d: sharedMetrics.recentApplications,
      applicationsLast30d: sharedMetrics.recentApplications, // TODO: add 30d metric to shared
    },
  };

  return NextResponse.json(metrics, {
    headers: {
      "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
    },
  });
}
