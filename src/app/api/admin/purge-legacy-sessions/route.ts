import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Admin one-shot: hard-delete legacy session rows (title=null) che sono
 * solo rumore in DB. Le applications collegate restano (sessionId
 * diventa null grazie a SetNull cascade su Application.session relation).
 *
 *   curl -X POST "https://lavorai.it/api/admin/purge-legacy-sessions?email=user@x.com" \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const email = new URL(req.url).searchParams.get("email")?.toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }
  const u = await prisma.user.findUnique({ where: { email } });
  if (!u) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const r = await prisma.applicationSession.deleteMany({
    where: {
      userId: u.id,
      title: null,
      status: "cancelled",
    },
  });
  return NextResponse.json({ ok: true, deleted: r.count });
}
