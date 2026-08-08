import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 60;

/**
 * Stats pubblici per landing: numeri REALI dal DB, no fake counters.
 * Cache 60s con SWR 300s per non hammer del DB dal traffico landing.
 */
export async function GET() {
  const TEST =
    /(@inbox\.testmail|@mailinator|@example\.|^postdbpush-|^test-|^demo-|umbertogeraci0@|geracigears@|antonella\.lasalandra07@|chatgpt-helper@|@lavorai\.it$)/i;
  try {
    const [allUsers, apps24h, appsTotal] = await Promise.all([
      prisma.user.findMany({ select: { email: true } }),
      prisma.application.count({
        where: {
          completedAt: { gte: new Date(Date.now() - 24 * 3600e3) },
          status: { in: ["success", "ready_to_apply", "awaiting_consent"] },
        },
      }),
      prisma.application.count({
        where: {
          status: { in: ["success", "ready_to_apply", "awaiting_consent"] },
        },
      }),
    ]);
    const realUsers = allUsers.filter((u) => !TEST.test(u.email)).length;
    return NextResponse.json(
      {
        users: realUsers,
        applicationsToday: apps24h,
        applicationsTotal: appsTotal,
      },
      {
        headers: {
          "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { users: 0, applicationsToday: 0, applicationsTotal: 0 },
      { headers: { "cache-control": "public, s-maxage=30" } },
    );
  }
}
