import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";

export const runtime = "nodejs";

/** The legacy timestamp-only grant cannot activate a card-backed trial.
 * Keep authentication, but never consume eligibility or announce false access. */
export async function POST() {
  const me = await getCurrentUser();
  if (!isAdmin(me?.email)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ error: "legacy_trial_grant_retired", granted: 0 }, { status: 410 });
}
