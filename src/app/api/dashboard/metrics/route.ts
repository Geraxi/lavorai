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
import type { JourneyStage } from "@/lib/ui-application-status";
import {
  getAllDashboardMetrics,
  getApplicationStageCounts,
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
      sentUnverified: number;
      providerAccepted: number;
      withReplies: number;
      interviews: number;
      offers: number;
    };
  progress: Record<JourneyStage, number>;
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
    stageData,
    newJobsCount,
    unreadCount,
    drafts,
  ] = await Promise.all([
    getAllDashboardMetrics(user.id),
    
    // Progress stages: evidence-aware, same function as the dashboard page
    getApplicationStageCounts(user.id),
    
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

  const progress = stageData.stages;

  const metrics: DashboardMetrics = {
    userId: user.id,
    computedAt: new Date().toISOString(),
    overview: {
      confirmed: sharedMetrics.confirmed,
      sentUnverified: sharedMetrics.sentUnverified,
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
