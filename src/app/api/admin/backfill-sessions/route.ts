import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Admin one-shot: per un utente, converte preferences.rolesJson in
 * sessioni "round" attive (max 3, ordinate da preferences). Le vecchie
 * sessioni status="auto" sono già auto-handle dal cron come active.
 *
 *   curl -X POST "https://lavorai.it/api/admin/backfill-sessions?email=user@x.com&target=30" \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const email = url.searchParams.get("email")?.trim().toLowerCase();
  const target = Math.max(
    1,
    Math.min(200, parseInt(url.searchParams.get("target") ?? "30", 10)),
  );
  if (!email) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { preferences: true },
  });
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  let roles: string[] = [];
  try {
    const arr = JSON.parse(user.preferences?.rolesJson ?? "[]");
    if (Array.isArray(arr)) roles = arr.filter((s) => typeof s === "string");
  } catch {
    /* noop */
  }
  if (roles.length === 0) {
    return NextResponse.json({ ok: true, created: 0, message: "no roles" });
  }

  // Tieni solo i primi 3 ruoli
  roles = roles.slice(0, 3);

  // Opzionale: cancella le sessioni legacy "auto" prima del backfill
  // (lascia stare quelle status="active" già round-style).
  if (url.searchParams.get("cleanLegacy") === "1") {
    const r = await prisma.applicationSession.updateMany({
      where: { userId: user.id, status: "auto" },
      data: { status: "cancelled", completedAt: new Date() },
    });
    console.log(`[backfill-sessions] legacy cancelled: ${r.count}`);
  }

  // Conta sessioni attive esistenti
  const existing = await prisma.applicationSession.findMany({
    where: {
      userId: user.id,
      status: { in: ["active", "auto", "paused"] },
    },
    select: { title: true, label: true },
  });
  const existingTitles = new Set(
    existing.map((s) => (s.title ?? s.label ?? "").toLowerCase().trim()),
  );

  let created = 0;
  for (const role of roles) {
    const t = role.trim();
    if (!t) continue;
    if (existingTitles.has(t.toLowerCase())) continue;
    if (existing.length + created >= 3) break;
    const key = `round::${t.toLowerCase().replace(/\s+/g, "-")}::${Date.now()}`;
    try {
      await prisma.applicationSession.create({
        data: {
          userId: user.id,
          key,
          label: `Round ${t}`,
          title: t,
          targetCount: target,
          sentCount: 0,
          status: "active",
        },
      });
      created++;
    } catch (err) {
      console.error("[backfill-sessions]", t, err);
    }
  }

  return NextResponse.json({ ok: true, created, totalRolesInPrefs: roles.length });
}
