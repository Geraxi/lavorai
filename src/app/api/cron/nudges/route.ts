import { NextResponse, type NextRequest } from "next/server";
import { runOnboardingNudges } from "@/lib/onboarding-nudge";
import { runUpgradeNudges } from "@/lib/upgrade-nudge";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Vercel Cron giornaliero — manda nudge onboarding (utenti bloccati) +
 * nudge upgrade (free attivi). Stesso schema auth dell'auto-apply cron.
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
  const [onboarding, upgrade] = await Promise.all([
    runOnboardingNudges({}).catch((err) => ({ error: String(err) })),
    runUpgradeNudges({}).catch((err) => ({ error: String(err) })),
  ]);
  return NextResponse.json({ ok: true, ms: Date.now() - t0, onboarding, upgrade });
}
