import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { estimateCoverage } from "@/lib/vertical-coverage";

export const runtime = "nodejs";

/**
 * GET /api/user/coverage — estimate onesta della copertura auto-apply
 * per il verticale dell'utente loggato. Usato dal <CoverageWarning/>
 * component per warn onestamente utenti in verticali low-coverage
 * (evita il caso Giuseppe: pagante che aspetta magia auto-apply per un
 * verticale amministrativo/SMB IT dove pochi annunci hanno canale ATS).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const prefs = await prisma.userPreferences.findUnique({
    where: { userId: user.id },
    select: { rolesJson: true, autoApplyMode: true },
  });
  const roles: string[] = prefs?.rolesJson
    ? (() => {
        try {
          const v = JSON.parse(prefs.rolesJson);
          return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
        } catch {
          return [];
        }
      })()
    : [];

  const est = estimateCoverage(roles);
  return NextResponse.json({
    ...est,
    currentMode: prefs?.autoApplyMode ?? "hybrid",
    rolesCount: roles.length,
  });
}
