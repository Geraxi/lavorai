import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const email = new URL(req.url).searchParams.get("email")?.toLowerCase();
  if (!email) return NextResponse.json({ error: "missing_email" }, { status: 400 });
  const u = await prisma.user.findUnique({ where: { email } });
  if (!u) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const sessions = await prisma.applicationSession.findMany({
    where: { userId: u.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { applications: true } } },
  });

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      label: s.label,
      status: s.status,
      sentCount: s.sentCount,
      targetCount: s.targetCount,
      totalApps: s._count.applications,
      createdAt: s.createdAt.toISOString(),
      completedAt: s.completedAt?.toISOString() ?? null,
    })),
  });
}
