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
  await prisma.user.update({
    where: { id: user.id },
    data: { welcomeSeenAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
