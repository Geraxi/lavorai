import { NextResponse, type NextRequest } from "next/server";
import { runOnboardingNudges } from "@/lib/onboarding-nudge";
import { runUpgradeNudges } from "@/lib/upgrade-nudge";
import { runAutoApplyCron } from "@/lib/auto-apply-cron";
import { syncAtsJobs } from "@/lib/scrapers/sync-jobs";
import { runCronSelfHeal } from "@/lib/cron-self-heal";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Vercel Cron giornaliero (l'unico cron garantito dal piano attuale).
 * Fa tutto in cascata: sync-jobs → self-heal → auto-apply → nudges.
 *
 * Se il piano upgrada e i cron dedicati (sync-jobs / auto-apply in
 * vercel.json) partono davvero, questa cascata resta idempotente.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const adminKey = process.env.ADMIN_SYNC_KEY;
  const auth = request.headers.get("authorization");
  const xAdmin = request.headers.get("x-admin-key");
  const authorized =
    (cronSecret && auth === `Bearer ${cronSecret}`) ||
    (adminKey && xAdmin === adminKey);
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const t0 = Date.now();

  // 1. Sync pool (nuovi job entrano) — fallisce silente se rate-limit.
  const sync = await syncAtsJobs().catch((err) => ({ error: String(err) }));

  // 2. Self-heal: re-parse CVProfile vuoti + unstuck app ferme.
  const heal = await runCronSelfHeal().catch((err) => ({ error: String(err) }));

  // 3. Auto-apply: crea candidature nuove per utenti auto+hybrid.
  const autoApply = await runAutoApplyCron().catch((err) => ({ error: String(err) }));

  // 4. Nudges (email onboarding + upgrade).
  const [onboarding, upgrade] = await Promise.all([
    runOnboardingNudges({}).catch((err) => ({ error: String(err) })),
    runUpgradeNudges({}).catch((err) => ({ error: String(err) })),
  ]);
  return NextResponse.json({
    ok: true,
    ms: Date.now() - t0,
    sync,
    heal,
    autoApply,
    onboarding,
    upgrade,
  });
}
