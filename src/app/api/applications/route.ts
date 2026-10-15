import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { InvalidApplicationCursor, listApplications } from "@/lib/application-list";

export const runtime = "nodejs";

/** Owner-scoped list, paged table/board, or a single deep-linked application.
 * Filters and counts are evaluated before pagination; no unbounded list mode. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    return NextResponse.json(await listApplications(prisma, user.id, request.nextUrl.searchParams), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof InvalidApplicationCursor) return NextResponse.json({ error: "invalid_cursor" }, { status: 400 });
    throw error;
  }
}
