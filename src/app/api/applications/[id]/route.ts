import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

const UserStatus = z.enum([
  "inviata",
  "vista",
  "colloquio",
  "offerta",
  "rifiutata",
]);

const Schema = z.object({
  userStatus: z.union([UserStatus, z.null()]),
});

/**
 * PATCH /api/applications/[id]
 * Solo per aggiornare lo stato manuale (viewed / interview / offer / rejected).
 * Non tocca lo stato del pipeline interno (queued → success).
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
  const app = await prisma.application.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!app || app.userId !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  await prisma.application.update({
    where: { id },
    data: { userStatus: parsed.data.userStatus ?? null },
  });
  return NextResponse.json({ ok: true });
}
