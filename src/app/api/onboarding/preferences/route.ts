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

  const { roles, locations, salaryMin, modeSel } = parsed.data;
  const sources = [
    modeSel.remoto && "remoto",
    modeSel.ibrido && "ibrido",
    modeSel.sede && "sede",
  ].filter(Boolean) as string[];

  await prisma.userPreferences.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      autoApplyOn: true,
      salaryMin,
      rolesJson: JSON.stringify(roles),
      locationsJson: JSON.stringify(locations),
      sourcesJson: JSON.stringify(sources),
    },
    update: {
      salaryMin,
      rolesJson: JSON.stringify(roles),
      locationsJson: JSON.stringify(locations),
      sourcesJson: JSON.stringify(sources),
    },
  });

  // Marca onboarding come completato
  await prisma.user.update({
    where: { id: user.id },
    data: { onboardedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
