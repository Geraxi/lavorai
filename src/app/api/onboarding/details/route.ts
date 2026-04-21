import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

const DetailsSchema = z.object({
  seniority: z
    .enum(["junior", "mid", "senior", "lead", "principal"])
    .nullable()
    .optional(),
  yearsExperience: z
    .number()
    .int()
    .min(0)
    .max(50)
    .nullable()
    .optional(),
  englishLevel: z
    .enum(["none", "a2", "b1", "b2", "c1", "c2"])
    .nullable()
    .optional(),
  italianNative: z.boolean().optional(),
  euAuthorized: z.boolean().optional(),
  noticePeriod: z
    .enum(["immediate", "1m", "2m", "3m_plus"])
    .nullable()
    .optional(),
  avoidCompanies: z.string().max(400).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthenticated", message: "Devi loggarti." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400 },
    );
  }

  const parsed = DetailsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: parsed.data,
  });

  return NextResponse.json({ ok: true });
}
