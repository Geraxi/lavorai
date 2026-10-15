import { onboardingAccessBlock } from "@/lib/onboarding-access";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Segna il welcome modal come visto dall'utente corrente.
 * Chiamato dal frontend quando si clicca "Inizia".
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const block = onboardingAccessBlock(user);
  if (block) return NextResponse.json(block, { status: block.status });
  await prisma.user.update({
    where: { id: user.id },
    data: { welcomeSeenAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
