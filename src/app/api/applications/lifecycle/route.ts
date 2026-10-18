import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deriveApplicationLifecycle, lifecycleSelect } from "@/lib/application-lifecycle";
import { historicalRetriesBlocked } from "@/lib/application-rollout";
import { workspaceReadOwner, WorkspaceError, workspaceError } from "@/lib/workspace-mutation";

export const runtime = "nodejs";

const ID = /^[a-zA-Z0-9_-]{1,100}$/;
const MAX = 50;

/**
 * GET /api/applications/lifecycle?ids=a,b,c   (max 50, owner-scoped)
 * GET /api/applications/lifecycle?limit=20    (newest first, max 50)
 *
 * Read-only. Returns the derived lifecycle (status, typed reason, delivery
 * evidence, user-facing labels in it/en, manual fallback). Contract:
 * docs/application-lifecycle.md. Never returns CV/letter bodies, form
 * contents, recipients or screenshots.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await workspaceReadOwner();
    const params = request.nextUrl.searchParams;
    const ids = (params.get("ids") ?? "").split(",").map((v) => v.trim()).filter(Boolean);
    if (ids.length > MAX || ids.some((id) => !ID.test(id))) throw new WorkspaceError("invalid_ids");
    const limit = Math.min(MAX, Math.max(1, Number.parseInt(params.get("limit") ?? "20", 10) || 20));
    const rows = await prisma.application.findMany({
      where: { userId, status: { not: "diagnostic" }, ...(ids.length ? { id: { in: ids } } : {}) },
      orderBy: { createdAt: "desc" },
      take: ids.length ? ids.length : limit,
      select: lifecycleSelect,
    });
    const retriesBlocked = historicalRetriesBlocked();
    const items = rows.map((row) => {
      const lifecycle = deriveApplicationLifecycle(row, { retriesBlocked });
      return { id: row.id, ...lifecycle,
        // Document links reuse the existing owner-only download route.
        documentsUrl: lifecycle.manual ? {
          cvPdf: lifecycle.manual.documents.cvPdf ? `/api/applications/${row.id}/document?kind=pdf` : null,
          cvDocx: lifecycle.manual.documents.cvDocx ? `/api/applications/${row.id}/document?kind=cv` : null,
          coverLetter: lifecycle.manual.documents.coverLetter ? `/api/applications/${row.id}/document?kind=cover` : null,
        } : null };
    });
    return NextResponse.json({ version: 1, items }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return workspaceError(error); }
}
