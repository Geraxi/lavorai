import { NextResponse, type NextRequest } from "next/server";
import { OnboardingPreferencesSchema as Schema } from "@/lib/onboarding-preferences";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { AnalyticsEvent } from "@/lib/analytics";
import { recordConversionEvent } from "@/lib/conversion-events";

export const runtime = "nodejs";



export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const {
    roles,
    locations,
    salaryMin,
    modeSel,
    employmentType,
    dailyRate,
    availableFrom,
    portfolioUrl,
  } = parsed.data;
  const sources = [
    modeSel.remoto && "remoto",
    modeSel.ibrido && "ibrido",
    modeSel.sede && "sede",
  ].filter(Boolean) as string[];

  const completedAt = new Date();

  await prisma.$transaction([
    prisma.userPreferences.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        autoApplyOn: true,
        salaryMin,
        employmentType: employmentType ?? "employee",
        dailyRate: dailyRate ?? null,
        availableFrom: availableFrom ?? null,
        portfolioUrl: portfolioUrl ?? null,
        rolesJson: JSON.stringify(roles),
        locationsJson: JSON.stringify(locations),
        sourcesJson: JSON.stringify(sources),
      },
      update: {
        // Il pulsante finale dell'onboarding è l'attivazione esplicita.
        // Vale anche per chi ha una preferenza pre-creata da un percorso
        // speciale (es. categorie protette).
        autoApplyOn: true,
        salaryMin,
        ...(employmentType != null ? { employmentType } : {}),
        ...(dailyRate !== undefined ? { dailyRate } : {}),
        ...(availableFrom !== undefined ? { availableFrom } : {}),
        ...(portfolioUrl !== undefined ? { portfolioUrl } : {}),
        rolesJson: JSON.stringify(roles),
        locationsJson: JSON.stringify(locations),
        sourcesJson: JSON.stringify(sources),
      },
    }),
    prisma.user.updateMany({
      where: { id: user.id, onboardedAt: null },
      data: { onboardedAt: completedAt },
    }),
  ]);

  await recordConversionEvent(AnalyticsEvent.ONBOARDING_COMPLETED, {
    userId: user.id,
    path: "/onboarding",
    properties: { roles: roles.length, locations: locations.length },
    dedupeKey: `onboarding_completed:${user.id}`,
  });
  return NextResponse.json({ ok: true, trialStarted: false, trialEndsAt: user.trialEndsAt });
}
