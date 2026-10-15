import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { applicationTimeline } from "@/lib/application-timeline";
import { workspaceReadOwner, WorkspaceError, workspaceError } from "@/lib/workspace-mutation";
/** Detail-only evidence. Never adds work to application-list pagination scans. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await workspaceReadOwner(); const { id } = await params;
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new WorkspaceError("invalid_id");
    const app = await prisma.application.findFirst({ where: { id, userId, status: { not: "diagnostic" } },
      select: { status: true, submittedVia: true, submitConfirmation: true, submissionReceiptJson: true, cvPdfPath: true, cvDocxPath: true, coverLetterPath: true, coverLetterText: true,
        emailAttempts: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { status: true, providerEmailId: true, acceptedAt: true,
          events: { where: { type: "email.delivered" }, orderBy: { occurredAt: "asc" }, take: 1, select: { type: true, occurredAt: true } } } },
        replies: { where: { isHuman: true, isSecurityCode: false, kind: { in: ["risposta", "colloquio", "rifiutata"] } }, orderBy: { receivedAt: "asc" }, take: 1, select: { receivedAt: true } },
        gmailMessages: { where: { userId, isHuman: true, kind: { in: ["risposta", "colloquio", "rifiutata"] } }, orderBy: { date: "asc" }, take: 1, select: { date: true } },
      } });
    if (!app) throw new WorkspaceError("application_unavailable", 404);
    return NextResponse.json({ steps: applicationTimeline(app) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return workspaceError(error); }
}
