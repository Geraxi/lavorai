import { NextResponse, type NextRequest } from "next/server";
import { defaultTrialExtensionDeps, runTrialExtension } from "@/lib/trial-extension";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Daily 11:30 UTC (after the 08:30 consent nudge and the 10:00 lifecycle
 * nudges, so it only uses quota they left). One-off extra free week + email for
 * expired-trial users who never paid. Sends only when TRIAL_EXTENSION_ENABLED=true;
 * otherwise, or with ?dry=1, a dry run (counts only, no DB writes, no email).
 * ?limit=N lowers this run's batch cap (never raises it above TRIAL_EXTENSION_BATCH_CAP).
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const adminKey = process.env.ADMIN_SYNC_KEY;
  const authorized =
    (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) ||
    (adminKey && request.headers.get("x-admin-key") === adminKey);
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dryRun = request.nextUrl.searchParams.get("dry") === "1";
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const limit = rawLimit && /^\d+$/.test(rawLimit) ? Number(rawLimit) : undefined;
  try {
    const result = await runTrialExtension(await defaultTrialExtensionDeps(), { dryRun, limit });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[trial-extension] failed", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ ok: false, error: "trial_extension_failed" }, { status: 500 });
  }
}
