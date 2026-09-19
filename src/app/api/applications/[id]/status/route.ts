import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

const ALLOWED_STATUSES = ["vista", "colloquio", "rifiutata", "offerta"];

/**
 * PUT /api/applications/:id/status
 * Aggiorna userStatus — override manuale dell'utente quando ha ricevuto
 * informazioni fuori dalla piattaforma (email personale, LinkedIn, chiamata).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { status } = await request.json().catch(() => ({}));
  if (!status || !ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: "Invalid status. Must be one of: " + ALLOWED_STATUSES.join(", ") },
      { status: 400 },
    );
  }

  const app = await prisma.application.findUnique({
    where: { id: params.id },
    select: { userId: true },
  });

  if (!app || app.userId !== user.id) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404 },
    );
  }

  await prisma.application.update({
    where: { id: params.id },
    data: { userStatus: status },
  });

  return NextResponse.json({ ok: true });
}
