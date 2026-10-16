import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin";
import { scanFeedbackFile } from "@/lib/feedback-scanner";
import { reportHandler, reportJson, requireReportActor, requireReportOrigin, ReportError } from "@/lib/feedback-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ reportId: string; id: string }> };
async function authorizedAttachment(context: Context, adminOnly = false) {
  const user = await requireReportActor(adminOnly);
  const { reportId, id } = await context.params;
  const attachment = await prisma.feedbackAttachment.findFirst({ where: { id, reportId, ...(!isAdmin(user.email) ? { report: { userId: user.id } } : {}) } });
  if (!attachment) throw new ReportError("not_found", 404);
  return attachment;
}
export function GET(_request: NextRequest, context: Context) {
  return reportHandler(async () => {
    const file = await authorizedAttachment(context);
    if (file.scanStatus === "quarantined") throw new ReportError("attachment_quarantined", 423);
    return new Response(new Uint8Array(file.data), { headers: {
      "Content-Type": file.contentType, "Content-Length": String(file.byteLength),
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'", "Referrer-Policy": "no-referrer",
      "Cross-Origin-Resource-Policy": "same-origin", "X-Frame-Options": "DENY",
    } });
  });
}
export function DELETE(request: NextRequest, context: Context) {
  return reportHandler(async () => {
    requireReportOrigin(request);
    const file = await authorizedAttachment(context);
    await prisma.feedbackAttachment.deleteMany({ where: { id: file.id, reportId: file.reportId } });
    return reportJson({ ok: true });
  });
}
// Admin-only quarantine release. The client never supplies a verdict or file URL.
export function POST(request: NextRequest, context: Context) {
  return reportHandler(async () => {
    requireReportOrigin(request);
    const file = await authorizedAttachment(context, true);
    if (file.scanStatus !== "quarantined") return reportJson({ ok: true });
    try {
      if (await scanFeedbackFile(Buffer.from(file.data)) !== "clean") throw new ReportError("scanner_unavailable", 503);
    } catch (error) {
      if (error instanceof ReportError && error.code === "attachment_rejected") await prisma.feedbackAttachment.deleteMany({ where: { id: file.id, scanStatus: "quarantined" } });
      throw error;
    }
    await prisma.feedbackAttachment.updateMany({ where: { id: file.id, scanStatus: "quarantined" }, data: { scanStatus: "clean" } });
    return reportJson({ ok: true });
  });
}
