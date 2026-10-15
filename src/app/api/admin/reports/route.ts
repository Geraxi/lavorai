import type { NextRequest } from "next/server";
import { listReports, reportHandler, requireReportActor } from "@/lib/feedback-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  return reportHandler(async () => { await requireReportActor(true); return listReports(request); });
}
