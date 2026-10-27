import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { syncGmailMessages } from "@/lib/gmail-client";

import { runGmailSync } from "@/lib/gmail-sync-runner";
import { gmailAttemptOrder } from "@/lib/gmail-sync-progress";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Background Gmail sync cron job.
 * Syncs Gmail messages for all users who have connected Gmail (Google Account with tokens).
 * 
 * Runs periodically to fetch recruiter replies that arrive at users' personal Gmail
 * addresses, classify them, and update Applications accordingly.
 * 
 * Auth: Requires CRON_SECRET header (same pattern as other crons).
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const adminKey = process.env.ADMIN_SYNC_KEY;
  const auth = request.headers.get("authorization");
  const xAdmin = request.headers.get("x-admin-key");
  const authorized =
    (cronSecret && auth === `Bearer ${cronSecret}`) ||
    (adminKey && xAdmin === adminKey);

  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const accounts = await prisma.account.findMany({ where: { provider: "google" },
      select: { id: true, userId: true, scope: true, access_token: true, refresh_token: true, expires_at: true, user: { select: { suspendedAt: true } } },
    });
    const result = await runGmailSync(accounts, await gmailAttemptOrder(), syncGmailMessages);
    // Aggregate technical state only: no account IDs, addresses, tokens or mail.
    console.info("[cron/gmail-sync]", result);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "gmail_sync_unavailable" }, { status: 503 });
  }
}
