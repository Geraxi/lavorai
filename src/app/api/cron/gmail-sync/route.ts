import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { syncGmailMessages, hasGmailConnected } from "@/lib/gmail-client";

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

  const t0 = Date.now();
  const stats = {
    usersChecked: 0,
    usersWithGmail: 0,
    totalSynced: 0,
    totalSkipped: 0,
    errors: [] as Array<{ userId: string; error: string }>,
  };

  try {
    // Find all users who have Google Account with tokens
    const usersWithGoogle = await prisma.account.findMany({
      where: {
        provider: "google",
        OR: [
          { access_token: { not: null } },
          { refresh_token: { not: null } },
        ],
      },
      select: {
        userId: true,
        user: {
          select: {
            email: true,
            suspendedAt: true,
          },
        },
      },
      distinct: ["userId"],
    });

    stats.usersChecked = usersWithGoogle.length;

    // Sync each user with rate limiting
    for (const account of usersWithGoogle) {
      // Skip suspended users
      if (account.user.suspendedAt) {
        continue;
      }

      try {
        stats.usersWithGmail++;
        
        // Sync up to 50 recent messages per user
        const result = await syncGmailMessages(account.userId, 50);
        
        stats.totalSynced += result.synced;
        stats.totalSkipped += result.skipped;

        if (result.error) {
          stats.errors.push({
            userId: account.userId,
            error: result.error,
          });
        }

        // Rate limit: small delay between users to avoid hitting Gmail API limits
        // Gmail API has a quota of 250 quota units per user per second
        // Each list call = 5 units, each get call = 5 units
        // With 50 messages: 1 list + 50 gets = 255 units
        // So we need at least 1 second between users
        await new Promise((resolve) => setTimeout(resolve, 1100));
      } catch (err) {
        console.error(`[cron/gmail-sync] Error syncing user ${account.userId}:`, err);
        stats.errors.push({
          userId: account.userId,
          error: err instanceof Error ? err.message : String(err),
        });
        // Continue with next user despite error
      }
    }

    const ms = Date.now() - t0;
    console.log(`[cron/gmail-sync] Completed in ${ms}ms`, stats);

    return NextResponse.json({
      ok: true,
      ms,
      ...stats,
    });
  } catch (err) {
    console.error("[cron/gmail-sync] Fatal error:", err);
    return NextResponse.json(
      {
        error: "internal",
        message: err instanceof Error ? err.message : "Unknown error",
        ...stats,
      },
      { status: 500 },
    );
  }
}
