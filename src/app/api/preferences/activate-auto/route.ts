import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyOneClick } from "@/lib/one-click-token";

export const runtime = "nodejs";

/**
 * GET /api/preferences/activate-auto?t=<token>
 * Link one-click dall'email "attiva l'auto-apply": mette l'utente in
 * modalità full-auto e sblocca le candidature ferme in attesa di consenso.
 */
export async function GET(req: NextRequest) {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";
  const t = req.nextUrl.searchParams.get("t") ?? "";
  const v = verifyOneClick(t, "activate_auto");
  if (!v) return NextResponse.redirect(`${site}/preferences?auto=invalid`);

  const user = await prisma.user.findUnique({ where: { id: v.userId }, select: { id: true, suspendedAt: true } });
  if (!user || user.suspendedAt) return NextResponse.redirect(`${site}/login`);

  await prisma.userPreferences.upsert({
    where: { userId: user.id },
    create: { userId: user.id, autoApplyMode: "auto", autoApplyOn: true },
    update: { autoApplyMode: "auto", autoApplyOn: true },
  });
  // Le candidature preparate e mai approvate ripartono da sole.
  const released = await prisma.application.updateMany({
    where: { userId: user.id, status: "awaiting_consent" },
    data: { status: "queued" },
  });
  console.log(`[activate-auto] user ${user.id} → auto (rilasciate ${released.count} candidature)`);
  return NextResponse.redirect(`${site}/dashboard?auto=on&released=${released.count}`);
}
