import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { loadReliabilityMetrics } from "@/lib/reliability-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/reliability-metrics?days=30 — admin-only JSON of /admin/reliability (aggregates only). */
export async function GET(request: NextRequest) {
  const viewer = await getCurrentUser();
  if (!isAdmin(viewer?.email)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const requested = Number(request.nextUrl.searchParams.get("days"));
  const days = [7, 14, 30, 90].includes(requested) ? requested : 30;
  const metrics = await loadReliabilityMetrics(viewer?.email, days);
  return NextResponse.json(metrics, { headers: { "Cache-Control": "private, no-store" } });
}
