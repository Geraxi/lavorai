import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { getDbDiagnostics } from "@/lib/db-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


/**
 * Admin-only, read-only database diagnostic for resolving authentication
 * routing issues. It never returns connection strings or credentials.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  return NextResponse.json(await getDbDiagnostics());
}
