import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";

export const runtime = "nodejs";

/**
 * GET /api/admin/popups/[id]/responses
 * Risposte degli utenti a un popup (le ultime 200). Admin-only.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const responses = await prisma.popupResponse.findMany({
    where: { popupId: id },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      rating: true,
      text: true,
      dismissed: true,
      createdAt: true,
      user: { select: { email: true } },
    },
  });

  const rated = responses.filter((r) => typeof r.rating === "number");
  const avgRating =
    rated.length > 0
      ? rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length
      : null;

  return NextResponse.json({
    responses,
    stats: {
      total: responses.length,
      answered: responses.filter((r) => !r.dismissed).length,
      dismissed: responses.filter((r) => r.dismissed).length,
      avgRating,
    },
  });
}
