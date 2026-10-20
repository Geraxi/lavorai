import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { checkOrigin } from "@/lib/csrf";

/** Scollega la casella: elimina i token salvati (l'utente può revocare anche dal pannello Google/Microsoft). */
export async function POST(req: NextRequest) {
  if (!checkOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { provider } = await req.json().catch(() => ({})) as { provider?: string };
  if (provider !== "gmail" && provider !== "outlook") return NextResponse.json({ error: "provider non valido" }, { status: 400 });
  await prisma.mailboxConnection.deleteMany({ where: { userId: user.id, provider } });
  // Gli invii preparati ma non approvati non possono più partire da quella casella.
  await prisma.mailboxSend.updateMany({ where: { userId: user.id, provider, state: { in: ["prepared", "approved"] }, sendClaimedAt: null }, data: { state: "failed", failureReason: "mailbox_disconnected", failedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
