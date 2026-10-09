import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { runCheckoutFeedbackCampaign } from "@/lib/checkout-feedback";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await runCheckoutFeedbackCampaign({ dryRun: true }));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { dryRun?: boolean };
  return NextResponse.json(await runCheckoutFeedbackCampaign({ dryRun: body.dryRun === true }));
}
