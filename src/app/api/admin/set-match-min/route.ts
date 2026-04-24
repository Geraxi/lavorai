import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Admin-only one-shot: forza matchMin per un utente via email.
 *
 *   curl -X POST https://lavorai.it/api/admin/set-match-min \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"email":"user@example.com","matchMin":50}'
 *
 * Auth: usa CRON_SECRET (Bearer). Solo operatori piattaforma.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    email?: string;
    matchMin?: number;
  } | null;
  const email = body?.email?.trim().toLowerCase();
  const matchMin = body?.matchMin;
  if (!email || typeof matchMin !== "number" || matchMin < 0 || matchMin > 100) {
    return NextResponse.json(
      { error: "bad_request", need: "email + matchMin 0-100" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: "user_not_found", email }, { status: 404 });
  }

  const updated = await prisma.userPreferences.upsert({
    where: { userId: user.id },
    create: { userId: user.id, matchMin },
    update: { matchMin },
  });

  return NextResponse.json({
    ok: true,
    userId: user.id,
    email,
    matchMin: updated.matchMin,
  });
}
