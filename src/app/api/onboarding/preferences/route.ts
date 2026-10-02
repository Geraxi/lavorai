import { NextResponse, type NextRequest } from "next/server";
import { OnboardingPreferencesSchema as Schema } from "@/lib/onboarding-preferences";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { AnalyticsEvent } from "@/lib/analytics";
import { recordConversionEvent } from "@/lib/conversion-events";
import { ACTIVATION_MESSAGES, getActivationReadiness } from "@/lib/activation-readiness";

export const runtime = "nodejs";


export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const beforePreferences = await prisma.user.findUnique({
    where: { id: user.id },
    select: { emailVerified: true, _count: { select: { cvDocuments: true } } },
  });
  if (!beforePreferences?.emailVerified) {
    return NextResponse.json({ error: "activation_incomplete", issue: "verify_email", message: ACTIVATION_MESSAGES.verify_email }, { status: 409 });
  }
  if (beforePreferences._count.cvDocuments === 0) {
    return NextResponse.json({ error: "activation_incomplete", issue: "upload_cv", message: ACTIVATION_MESSAGES.upload_cv }, { status: 409 });
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
  ]);

  const readiness = await getActivationReadiness(user.id);
  if (!readiness.ready) {
    return NextResponse.json({ error: "activation_incomplete", issue: readiness.issue, message: ACTIVATION_MESSAGES[readiness.issue!] }, { status: 409 });
  }

  await prisma.user.updateMany({ where: { id: user.id, onboardedAt: null }, data: { onboardedAt: new Date() } });

  await recordConversionEvent(AnalyticsEvent.ONBOARDING_COMPLETED, {
    userId: user.id,
    path: "/onboarding",
    properties: { roles: roles.length, locations: locations.length },
    dedupeKey: `onboarding_completed:${user.id}`,
  });
  return NextResponse.json({ ok: true, trialStarted: false, trialEndsAt: user.trialEndsAt });
}
