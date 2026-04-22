import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

const Schema = z.object({
  status: z.enum(["auto", "paused"]),
});

/**
 * PATCH /api/sessions/[id] — pause/resume una sessione.
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
    select: { userId: true },
  });
  if (!s || s.userId !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  await prisma.applicationSession.update({
    where: { id },
    data: { status: parsed.data.status },
  });
  return NextResponse.json({ ok: true, status: parsed.data.status });
}
