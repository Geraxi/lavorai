import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { reuseCvAnswers } from "@/lib/cv-answer-reuse";

/** Repair existing records only. Never enqueue, submit, or change user preferences. */
export async function POST(request: NextRequest) {
  const admin = await getCurrentUser();
  if (!isAdmin(admin?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.userId !== "string") return NextResponse.json({ error: "invalid_user" }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true, yearsExperience: true } });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const answersRecovered = await reuseCvAnswers(user.id, user.yearsExperience);
  const corrected = await prisma.application.updateMany({
    where: { userId: user.id, status: "failed", AND: [
      { OR: [{ submitConfirmation: null }, { submitConfirmation: "UNCONFIRMED" }] },
      { OR: [{ errorMessage: { contains: "Submit cliccato ma niente è stato confermato" } }, { canaryLog: { contains: "Submit cliccato ma niente è stato confermato" } }] },
    ] },
    data: { status: "ready_to_apply", submitConfirmation: "UNCONFIRMED", errorMessage: "Invio non confermato dal portale. Prima di ritentare, verifica l’eventuale ricevuta per evitare una candidatura duplicata." },
  });
  return NextResponse.json({ ok: true, answersRecovered, unconfirmedCorrected: corrected.count, submitted: 0 });
}
