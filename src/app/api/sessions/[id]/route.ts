import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

const Schema = z.object({
  status: z.enum(["active", "paused", "cancelled", "auto"]).optional(),
  acknowledgeCompleted: z.boolean().optional(),
});

/**
 * PATCH /api/sessions/[id] — cambia stato (pause/resume/cancel) o
 * marca come visto un round completato (così il prompt dashboard sparisce).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const s = await prisma.applicationSession.findUnique({
    where: { id },
    select: { userId: true, status: true },
  });
  if (!s || s.userId !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const data: {
    status?: string;
    completedAcknowledgedAt?: Date;
    completedAt?: Date | null;
  } = {};
  if (parsed.data.status) {
    // "auto" legacy → "active"
    data.status = parsed.data.status === "auto" ? "active" : parsed.data.status;
    if (data.status === "cancelled") {
      data.completedAt = new Date();
    }
  }
  if (parsed.data.acknowledgeCompleted) {
    data.completedAcknowledgedAt = new Date();
  }
  await prisma.applicationSession.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await params;
  const s = await prisma.applicationSession.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!s || s.userId !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // Soft-delete: status=cancelled. Le candidature collegate restano in
  // DB con sessionId valido (per audit + non perdere risultati).
  await prisma.applicationSession.update({
    where: { id },
    data: { status: "cancelled", completedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
