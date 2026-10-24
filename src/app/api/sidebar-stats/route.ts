import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { dailyApplicationLimit } from "@/lib/billing";
import { countDailyCapUsage } from "@/lib/daily-application-cap";
import { getApplicationTotal } from "@/lib/dashboard-metrics-shared";

export const runtime = "nodejs";

/**
 * GET /api/sidebar-stats
 *
 * Conteggi leggeri per la sidebar: total applications + auto-apply
 * di oggi. Movimentato OFF dal layout server component perché era
 * blocking su ogni navigazione (sentita come pagina "lenta"). Ora
 * la sidebar fa SWR a questo endpoint dopo il primo paint —
 * navigazione istantanea.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ applicationsCount: 0, autoApplyToday: 0, autoApplyRemaining: 0 });
  }
  const [applicationsCount, todayCount, prefs] = await Promise.all([
    getApplicationTotal(user.id),
    countDailyCapUsage(prisma, user.id),
    prisma.userPreferences.findUnique({ where: { userId: user.id }, select: { dailyCap: true } }),
  ]);
  const dailyCap = dailyApplicationLimit(user, prefs?.dailyCap);
  return NextResponse.json({
    applicationsCount,
    autoApplyToday: todayCount,
    autoApplyRemaining: Math.max(0, dailyCap - todayCount),
  });
}
