import { rememberAnalyticsConsent } from "@/lib/posthog/server";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { checkOrigin } from "@/lib/csrf";

export async function POST(request: NextRequest) {
  if (!checkOrigin(request)) return new NextResponse(null, { status: 403 });
  const session = await auth();
  if (!session?.user?.id) return new NextResponse(null, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.accepted !== "boolean") return new NextResponse(null, { status: 400 });
  await rememberAnalyticsConsent(session.user.id, body.accepted);
  return new NextResponse(null, { status: 204 });
}
