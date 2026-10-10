import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ACTIVATION_MESSAGES, getActivationReadiness } from "@/lib/activation-readiness";
import { AnalyticsEvent } from "@/lib/analytics";
import { recordConversionEvent } from "@/lib/conversion-events";

export const runtime = "nodejs";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const readiness = await getActivationReadiness(user.id);
  if (!readiness.ready) {
    return NextResponse.json({ error: "activation_incomplete", issue: readiness.issue, message: ACTIVATION_MESSAGES[readiness.issue!] }, { status: 409 });
  }

  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { demoGeneratedAt: true } });
  if (!account?.demoGeneratedAt) {
    return NextResponse.json({ error: "demo_required", message: ACTIVATION_MESSAGES.preview_demo }, { status: 409 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { demoCompletedAt: new Date(), onboardedAt: new Date() },
  });
  await recordConversionEvent(AnalyticsEvent.ONBOARDING_COMPLETED, {
    userId: user.id,
    path: "/onboarding",
    properties: { completedAfterDemo: true },
    dedupeKey: `onboarding_completed:${user.id}`,
  });
  return NextResponse.json({ ok: true });
}
