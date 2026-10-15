import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { reportStatusSchema } from "@/lib/feedback";
import { adminReportSelect, readReportBody, reportHandler, reportJson, ReportError, requireReportActor, requireReportOrigin } from "@/lib/feedback-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
async function reportId(context: Context) {
  const { id } = await context.params;
  if (!/^[a-z0-9]{1,40}$/i.test(id)) throw new ReportError("not_found", 404);
  return id;
}
export function GET(_request: NextRequest, context: Context) {
  return reportHandler(async () => {
    await requireReportActor(true);
    const report = await prisma.feedbackReport.findUnique({ where: { id: await reportId(context) }, select: adminReportSelect });
    if (!report) throw new ReportError("not_found", 404);
    return reportJson({ report });
  });
}
export function PATCH(request: NextRequest, context: Context) {
  return reportHandler(async () => {
    requireReportOrigin(request);
    await requireReportActor(true);
    const id = await reportId(context);
    const parsed = reportStatusSchema.safeParse(await readReportBody(request));
    if (!parsed.success) throw new ReportError("invalid_status", 400);
    const result = await prisma.feedbackReport.updateMany({ where: { id }, data: { status: parsed.data.status } });
    if (!result.count) throw new ReportError("not_found", 404);
    return reportJson({ ok: true });
  });
}
