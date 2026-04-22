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
      matchMin: matchMin ?? 75,
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
