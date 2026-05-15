import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { effectiveTier } from "@/lib/billing";

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
  const [applicationsCount, todayCount] = await Promise.all([
    prisma.application.count({ where: { userId: user.id } }),
    prisma.application.count({
      where: {
        userId: user.id,
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
  ]);
  const tier = effectiveTier(user);
  const dailyCap = tier === "free" ? 3 : tier === "pro" ? 50 : 100;
  return NextResponse.json({
    applicationsCount,
    autoApplyToday: todayCount,
    autoApplyRemaining: Math.max(0, dailyCap - todayCount),
  });
}
