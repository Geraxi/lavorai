import { NextResponse, type NextRequest } from "next/server";
import { defaultSettingsNudgeDeps, runSettingsBlockerNudge } from "@/lib/settings-blocker-nudge";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Daily 08:45 UTC (after the consent/questions nudge, before the 09:00 UTC
 * auto-apply run). Pro/trial users blocked by their own settings.
 * Sends only when SETTINGS_NUDGE_ENABLED=true; otherwise a dry run that
 * returns and logs counts (no DB writes, no email). Never changes settings.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const adminKey = process.env.ADMIN_SYNC_KEY;
  const authorized =
    (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) ||
    (adminKey && request.headers.get("x-admin-key") === adminKey);
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await runSettingsBlockerNudge(await defaultSettingsNudgeDeps());
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[settings-blocker-nudge] failed", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ ok: false, error: "nudge_failed" }, { status: 500 });
  }
}
