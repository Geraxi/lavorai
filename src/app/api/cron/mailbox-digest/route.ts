import { NextResponse, type NextRequest } from "next/server";
import { runMailboxDigest } from "@/lib/application-mailbox-digest";
import { createResendMailboxMailer } from "@/lib/application-mailbox-notify";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Daily digest of non-priority application mailbox mail. Never replies to employers. */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const adminKey = process.env.ADMIN_SYNC_KEY;
  const authorized =
    (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) ||
    (adminKey && request.headers.get("x-admin-key") === adminKey);
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const send = createResendMailboxMailer();
  if (!send) return NextResponse.json({ ok: true, skipped: "no_resend_key" });
  return NextResponse.json({ ok: true, ...(await runMailboxDigest({ send })) });
}
