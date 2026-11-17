import { NextResponse, type NextRequest } from "next/server";
import { defaultNudgeDeps, runConsentQuestionsNudge } from "@/lib/consent-questions-nudge";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Daily 08:30 UTC, 30 minutes before the 09:00 UTC auto-apply run.
 * Privacy-consent and pending-questions service nudges to our own users.
 * Sends only when CONSENT_NUDGE_ENABLED=true; otherwise a dry run that
 * returns and logs counts (no DB writes, no email). Never records consent.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const adminKey = process.env.ADMIN_SYNC_KEY;
  const authorized =
    (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) ||
    (adminKey && request.headers.get("x-admin-key") === adminKey);
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await runConsentQuestionsNudge(await defaultNudgeDeps());
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[consent-questions-nudge] failed", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ ok: false, error: "nudge_failed" }, { status: 500 });
  }
}
