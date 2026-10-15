import type { NextRequest } from "next/server";
import { reportSchema } from "@/lib/feedback";
import { createReport, listReports, readReportBody, reportHandler, reportJson, ReportError, requireReportActor, requireReportOrigin } from "@/lib/feedback-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  return reportHandler(async () => {
    const user = await requireReportActor();
    return listReports(request, user.id);
  });
}
export function POST(request: NextRequest) {
  return reportHandler(async () => {
    requireReportOrigin(request);
    const user = await requireReportActor();
    const parsed = reportSchema.safeParse(await readReportBody(request));
    if (!parsed.success) throw new ReportError("invalid_report", 400);
    const report = await createReport(user.id, parsed.data);
    return reportJson({ report }, 201);
  });
}
