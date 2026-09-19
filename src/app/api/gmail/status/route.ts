import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { hasGmailConnected } from "@/lib/gmail-client";

/**
 * GET /api/gmail/status
 * 
 * Check if user has Gmail connected (Google Account with valid tokens).
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connected = await hasGmailConnected(user.id);

    return NextResponse.json({ connected });
  } catch (error) {
    console.error("[api/gmail/status] Error:", error);
    return NextResponse.json(
      { error: "Failed to check Gmail status" },
      { status: 500 },
    );
  }
}
