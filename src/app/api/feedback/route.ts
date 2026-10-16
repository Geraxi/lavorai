import type { NextRequest } from "next/server";
import { readReportSubmission } from "@/lib/feedback-upload";
import { createReport, listReports, reserveFeedbackUpload, reportHandler, reportJson, requireReportActor, requireReportOrigin } from "@/lib/feedback-server";

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
    if (request.headers.get("content-type")?.split(";")[0].trim() === "multipart/form-data") await reserveFeedbackUpload(user.id);
    const { input, attachments } = await readReportSubmission(request);
    const report = await createReport(user.id, input, attachments);
    return reportJson({ report }, 201);
  });
}
