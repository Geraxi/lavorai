import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { syncGmailMessages } from "@/lib/gmail-client";

/**
 * POST /api/gmail/sync
 * 
 * Trigger Gmail sync for the current user. Called by:
 * - Manual "Refresh" button in inbox UI
 * - Cron job (future) for periodic background sync
 * 
 * Returns count of new messages synced.
 */
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await syncGmailMessages(user.id, 100);

    if (result.error) {
      return NextResponse.json(
        { error: result.error, synced: result.synced, skipped: result.skipped },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      synced: result.synced,
      skipped: result.skipped,
    });
  } catch (error) {
    console.error("[api/gmail/sync] Error:", error);
    return NextResponse.json(
      { error: "Gmail sync failed. Please try again." },
      { status: 500 },
    );
  }
}
