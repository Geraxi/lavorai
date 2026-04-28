import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

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
  autoApplyOn: z.boolean().optional(),
  autoApplyMode: z.enum(["off", "manual", "hybrid", "auto"]).optional(),
  dailyCap: z.number().int().min(1).max(100).optional(),
  matchMin: z.number().int().min(0).max(100).optional(),
  employmentType: z.enum(["employee", "piva", "both"]).optional(),
  dailyRate: z.number().int().min(0).max(5000).nullable().optional(),
  availableFrom: z.string().trim().max(60).nullable().optional(),
  vatNumber: z.string().trim().max(30).nullable().optional(),
  portfolioUrl: z.string().trim().max(300).url().nullable().optional(),
  applicationAnswers: z
    .object({
      workAuthEU: z
        .enum(["yes_eu_citizen", "yes_permit", "no_needs_sponsorship"])
        .nullable()
        .optional(),
      salaryExpectationEur: z.number().int().min(0).max(500000).nullable().optional(),
      relocate: z.boolean().nullable().optional(),
      noticePeriod: z
        .enum(["immediate", "2weeks", "1month", "2months", "3months_plus"])
        .nullable()
        .optional(),
      linkedinUrl: z.string().trim().max(300).nullable().optional(),
      githubUrl: z.string().trim().max(300).nullable().optional(),
      howHeard: z
        .enum(["linkedin", "google", "referral", "other"])
        .nullable()
        .optional(),
      whyInterested: z.string().trim().max(500).nullable().optional(),
      eeoGender: z
        .enum(["male", "female", "non_binary", "prefer_not"])
        .nullable()
        .optional(),
      eeoVeteran: z.enum(["yes", "no", "prefer_not"]).nullable().optional(),
      eeoDisability: z.enum(["yes", "no", "prefer_not"]).nullable().optional(),
    })
    .optional(),
  excludedCompanies: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
});

/**
 * GET /api/preferences — snapshot minimale usato da widget (pausa auto-apply, ecc.)
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const prefs = await prisma.userPreferences.findUnique({
    where: { userId: user.id },
    select: { autoApplyMode: true, matchMin: true },
  });
  return NextResponse.json({
    autoApplyMode: prefs?.autoApplyMode ?? "manual",
    matchMin: prefs?.matchMin ?? 75,
  });
}

export async function PUT(request: NextRequest) {
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
    autoApplyOn,
    autoApplyMode,
    dailyCap,
    matchMin,
    employmentType,
    dailyRate,
    availableFrom,
    vatNumber,
    portfolioUrl,
    applicationAnswers,
    excludedCompanies,
  } = parsed.data;

  const modes = [
    modeSel.remoto && "remoto",
    modeSel.ibrido && "ibrido",
    modeSel.sede && "sede",
  ].filter(Boolean) as string[];

  await prisma.userPreferences.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      autoApplyOn: autoApplyOn ?? autoApplyMode !== "off",
      autoApplyMode: autoApplyMode ?? "hybrid",
      dailyCap: dailyCap ?? 25,
      matchMin: matchMin ?? 50,
      employmentType: employmentType ?? "employee",
      dailyRate: dailyRate ?? null,
      availableFrom: availableFrom ?? null,
      vatNumber: vatNumber ?? null,
      portfolioUrl: portfolioUrl ?? null,
      applicationAnswersJson: applicationAnswers
        ? JSON.stringify(stripNulls(applicationAnswers))
        : "{}",
      salaryMin,
      rolesJson: JSON.stringify(roles),
      locationsJson: JSON.stringify(locations),
      sourcesJson: JSON.stringify(modes),
    },
    update: {
      ...(autoApplyOn != null ? { autoApplyOn } : {}),
      ...(autoApplyMode != null ? { autoApplyMode } : {}),
      ...(dailyCap != null ? { dailyCap } : {}),
      ...(matchMin != null ? { matchMin } : {}),
      ...(employmentType != null ? { employmentType } : {}),
      ...(dailyRate !== undefined ? { dailyRate } : {}),
      ...(availableFrom !== undefined ? { availableFrom } : {}),
      ...(vatNumber !== undefined ? { vatNumber } : {}),
      ...(portfolioUrl !== undefined ? { portfolioUrl } : {}),
      ...(applicationAnswers !== undefined
        ? {
            applicationAnswersJson: JSON.stringify(
              stripNulls(applicationAnswers),
            ),
          }
        : {}),
      salaryMin,
      rolesJson: JSON.stringify(roles),
      locationsJson: JSON.stringify(locations),
      sourcesJson: JSON.stringify(modes),
    },
  });

  // Aziende escluse: vivono su User.avoidCompanies (comma-separated, lowercase)
  if (excludedCompanies !== undefined) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        avoidCompanies:
          excludedCompanies.length > 0
            ? excludedCompanies.map((s) => s.toLowerCase()).join(",")
            : null,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

function stripNulls<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out as Partial<T>;
}
