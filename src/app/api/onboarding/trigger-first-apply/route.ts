import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { runAutoApplyForUser } from "@/lib/auto-apply-cron";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/onboarding/trigger-first-apply
 *
 * Chiamato quando un utente completa onboarding (CV + preferenze
 * salvate). Fa partire subito una passata di auto-apply per QUELL'utente
 * — così vede le sue prime candidature nel dashboard in ~2 min invece
 * di aspettare il cron della notte.
 *
 * Rate limit implicito: eseguibile solo se l'utente non ha già almeno
 * 3 candidature nel sistema (evita spam se cliccato più volte o dal
 * cron mentre stiamo lanciando).
 *
 * NON serve a bypassare cap/paywall: usa lo stesso processUser del
 * cron notturno, con gli stessi guardrail.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const existingApps = await prisma.application.count({
    where: { userId: user.id },
  });
  if (existingApps >= 3) {
    return NextResponse.json({
      ok: true,
      skipped: "already_has_apps",
      existingApps,
    });
  }

  const stats = await runAutoApplyForUser(user.id);
  return NextResponse.json({
    ok: true,
    stats: {
      enqueued: stats.applicationsEnqueued,
      awaitingConsent: stats.applicationsAwaitingConsent,
      errors: stats.errors,
    },
  });
}
