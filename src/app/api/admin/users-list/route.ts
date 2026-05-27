import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isAdmin, isTestAccount } from "@/lib/admin";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/admin/users-list — lightweight directory used by admin dropdowns
 * (es. Nudge → "scegli destinatario"). Esclude account test/interni di default.
 * Query: ?includeTest=1 per includerli.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const includeTest = new URL(req.url).searchParams.get("includeTest") === "1";

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: { email: true, name: true, tier: true },
    take: 500,
  });

  const filtered = includeTest ? users : users.filter((u) => !isTestAccount(u.email));

  return NextResponse.json({
    count: filtered.length,
    users: filtered,
  });
}
