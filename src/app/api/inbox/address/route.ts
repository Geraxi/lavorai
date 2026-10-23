import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { checkOrigin } from "@/lib/csrf";
import { ensureUserInbox, getUserInboxAddress } from "@/lib/inbound/service";

/** GET: current per-user LavorAI address (or null). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ address: await getUserInboxAddress(prisma, user.id) });
}

/** POST: generate the address on demand (idempotent). */
export async function POST(request: NextRequest) {
  if (!checkOrigin(request)) return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const inbox = await ensureUserInbox(prisma, user.id);
    return NextResponse.json({ address: inbox.disabledAt ? null : inbox.address });
  } catch (e) {
    console.error(`[inbox/address] create failed: ${e instanceof Error ? e.message.slice(0, 60) : "unknown"}`);
    return NextResponse.json({ error: "inbox_unavailable" }, { status: 503 });
  }
}
