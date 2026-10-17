import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { workspaceOwner, smallJson, workspaceError, WorkspaceError } from "@/lib/workspace-mutation";
import { releaseHeldApplicationsForUser } from "@/lib/held-application-release";

export const runtime = "nodejs";

/** An explicit, owned, same-origin assertion. Never creates applications or
 * grants per-application consent. Repeated requests preserve the first date.
 * Rows the worker held only for missing consent/verification are released to
 * normal admission (held-application-release.ts); nothing is sent here. */
export async function POST(request: NextRequest) {
  try {
    const userId = await workspaceOwner(request);
    const body = await smallJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || body.privacyConsent !== true) throw new WorkspaceError("explicit_consent_required");
    await prisma.user.updateMany({ where: { id: userId, privacyConsentAt: null }, data: { privacyConsentAt: new Date() } });
    await releaseHeldApplicationsForUser(userId, "privacy_consent");
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return workspaceError(error); }
}
