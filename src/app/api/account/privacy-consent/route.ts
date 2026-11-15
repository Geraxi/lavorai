import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { workspaceOwner, smallJson, workspaceError, WorkspaceError } from "@/lib/workspace-mutation";
import { releaseHeldApplicationsForUserReport, type HeldApplicationReleaseReport } from "@/lib/held-application-release";

export const runtime = "nodejs";

/** An explicit, owned, same-origin assertion. Never creates applications or
 * grants per-application consent. Repeated requests preserve the first date.
 * Eligible held rows may return to normal admission through the existing
 * recovery gates. Saving consent never guarantees restart or delivery. */
export async function POST(request: NextRequest) {
  try {
    const userId = await workspaceOwner(request);
    const body = await smallJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || body.privacyConsent !== true) throw new WorkspaceError("explicit_consent_required");
    await prisma.user.updateMany({ where: { id: userId, privacyConsentAt: null }, data: { privacyConsentAt: new Date() } });
    let release: HeldApplicationReleaseReport;
    try {
      release = await releaseHeldApplicationsForUserReport(userId, "privacy_consent");
    } catch {
      // Consent is already committed. Even an unexpected recovery failure
      // must not tell the user it was not saved or encourage blind retries.
      release = { requeuedCount: 0, status: "incomplete" };
    }
    return NextResponse.json({ ok: true, privacyConsentRecorded: true, release }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return workspaceError(error); }
}
