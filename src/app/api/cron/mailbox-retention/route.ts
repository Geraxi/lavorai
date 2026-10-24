import { NextResponse, type NextRequest } from "next/server";
import { purgeExpiredMailbox } from "@/lib/application-mailbox-store";
import { MAILBOX_RETENTION_DAYS } from "@/lib/application-mailbox";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GDPR retention: delete application mailbox mail older than MAILBOX_RETENTION_DAYS. */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const adminKey = process.env.ADMIN_SYNC_KEY;
  const authorized =
    (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) ||
    (adminKey && request.headers.get("x-admin-key") === adminKey);
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, days: MAILBOX_RETENTION_DAYS, ...(await purgeExpiredMailbox()) });
}
