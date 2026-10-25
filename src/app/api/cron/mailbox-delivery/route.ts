import { NextResponse, type NextRequest } from "next/server";
import { applicationsPaused } from "@/lib/application-pause";
import { checkMailboxDeliveries } from "@/lib/mailbox/service";
import { realMailboxDeps } from "@/lib/mailbox/runtime";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Cron: rilegge i thread degli invii reali per rilevare rimbalzi (DSN) e chiudere la finestra di 48h. */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const adminKey = process.env.ADMIN_SYNC_KEY;
  const authorized = (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) || (adminKey && request.headers.get("x-admin-key") === adminKey);
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (applicationsPaused()) return NextResponse.json({ ok: true, paused: true, reason: "applications_paused" });
  return NextResponse.json({ ok: true, ...(await checkMailboxDeliveries(realMailboxDeps())) });
}
