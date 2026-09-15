import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { sendTrialStartedEmail } from "@/lib/trial";
import { AnalyticsEvent } from "@/lib/analytics";
import { recordConversionEvent } from "@/lib/conversion-events";

export const runtime = "nodejs";

const Schema = z.object({
  roles: z.array(z.string().trim().min(1).max(80)).max(30),
  locations: z.array(z.string().trim().min(1).max(80)).max(30),
  salaryMin: z.number().int().min(0).max(500),
  modeSel: z.object({
    remoto: z.boolean(),
    ibrido: z.boolean(),
    sede: z.boolean(),
  }),
  employmentType: z.enum(["employee", "piva", "both"]).optional(),
  dailyRate: z.number().int().min(0).max(5000).nullable().optional(),
  availableFrom: z.string().trim().max(60).nullable().optional(),
  portfolioUrl: z
    .string()
    .trim()
    .max(300)
    .url()
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
});

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
  const trialEndsAt = new Date(
    completedAt.getTime() + user.trialDurationDays * 86400_000,
  );

  const [, trialActivation] = await prisma.$transaction([
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
      where: {
        id: user.id,
        onboardedAt: null,
        trialEndsAt: null,
        proTrialUsedAt: null,
        stripeSubscriptionId: null,
        tier: "free",
      },
      data: { onboardedAt: completedAt, trialEndsAt, proTrialUsedAt: completedAt },
    }),
  ]);

  // Gli utenti già completati devono restare idempotenti; aggiorniamo solo
  // il timestamp mancante senza riavviare mai una prova scaduta.
  if (trialActivation.count === 0 && !user.onboardedAt) {
    await prisma.user.update({ where: { id: user.id }, data: { onboardedAt: completedAt } });
  }

  const activated = trialActivation.count === 1;
  await recordConversionEvent(AnalyticsEvent.ONBOARDING_COMPLETED, {
    userId: user.id,
    path: "/onboarding",
    properties: { roles: roles.length, locations: locations.length },
    dedupeKey: `onboarding_completed:${user.id}`,
  });
  if (activated) {
    await recordConversionEvent(AnalyticsEvent.TRIAL_STARTED, {
      userId: user.id,
      plan: "pro",
      valueCents: 0,
      properties: { days: user.trialDurationDays },
      dedupeKey: `trial_started:${user.id}`,
    });
    sendTrialStartedEmail({
      id: user.id,
      email: user.email,
      name: user.name,
      locale: user.locale,
      trialEndsAt,
    }).catch((err) => console.error("[onboarding] trial email failed", err));
  }

  return NextResponse.json({ ok: true, trialStarted: activated, trialEndsAt: activated ? trialEndsAt : null });
}
