import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { workspaceOwner, smallJson, workspaceError, WorkspaceError } from "@/lib/workspace-mutation";

export const runtime = "nodejs";

/** An explicit, owned, same-origin assertion. Never queues applications or
 * grants per-application consent. Repeated requests preserve the first date. */
export async function POST(request: NextRequest) {
  try {
    const userId = await workspaceOwner(request);
    const body = await smallJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || body.privacyConsent !== true) throw new WorkspaceError("explicit_consent_required");
    await prisma.user.updateMany({ where: { id: userId, privacyConsentAt: null }, data: { privacyConsentAt: new Date() } });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return workspaceError(error); }
}
