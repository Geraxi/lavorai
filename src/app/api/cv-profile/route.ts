import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import {
  CVProfileSchema,
  EMPTY_PROFILE,
  profileToRow,
  rowToProfile,
} from "@/lib/cv-profile-types";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const row = await prisma.cVProfile.findUnique({
    where: { userId: user.id },
  });
  if (!row) {
    return NextResponse.json({ profile: EMPTY_PROFILE, exists: false });
  }
  return NextResponse.json({
    profile: rowToProfile(row),
    exists: true,
    pdf: {
      available: Boolean(row.pdfPath),
      language: row.pdfLanguage ?? null,
    },
  });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = CVProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const row = profileToRow(parsed.data);
  // Invalida il PDF base quando il profilo cambia — verrà rigenerato on demand
  await prisma.cVProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...row },
    update: { ...row, pdfPath: null, pdfLanguage: null },
  });
  return NextResponse.json({ ok: true });
}
