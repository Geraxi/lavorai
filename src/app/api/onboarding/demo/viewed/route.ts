import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { onboardingAccessBlock } from "@/lib/onboarding-access";
import { prisma } from "@/lib/db";
import { recordConversionEvent } from "@/lib/conversion-events";
import { AnalyticsEvent } from "@/lib/analytics";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const block = onboardingAccessBlock(user);
  if (block) return NextResponse.json(block, { status: block.status });
  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { demoPreviewJson: true } });
  if (!account?.demoPreviewJson) return NextResponse.json({ error: "preview_required" }, { status: 409 });
  await recordConversionEvent(AnalyticsEvent.ONBOARDING_DEMO_VIEWED, {
    userId: user.id, path: "/onboarding", dedupeKey: `onboarding_demo:${user.id}`,
  });
  return NextResponse.json({ ok: true });
}
