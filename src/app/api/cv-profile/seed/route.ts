import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { extractFullProfile } from "@/lib/cv-profile-ai-full";
import { profileToRow, rowToProfile } from "@/lib/cv-profile-types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/cv-profile/seed
 * Estrae il profilo strutturato dal CV più recente dell'utente via Claude.
 * Non sovrascrive se l'utente ha già salvato qualcosa (idempotente verso l'edit manuale).
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const [existingProfile, cv] = await Promise.all([
    prisma.cVProfile.findUnique({ where: { userId: user.id } }),
    prisma.cVDocument.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!cv) {
    return NextResponse.json(
      { error: "no_cv", message: "Carica prima un CV." },
      { status: 409 },
    );
  }

  // Solo se profile mancante o vuoto (evitiamo di calpestare edits manuali)
  if (existingProfile) {
    const hasContent =
      existingProfile.firstName ||
      existingProfile.lastName ||
      existingProfile.summary ||
      existingProfile.experiencesJson !== "[]";
    if (hasContent) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        profile: rowToProfile(existingProfile),
      });
    }
  }

  const profile = await extractFullProfile(cv.extractedText);
  const row = profileToRow(profile);
  await prisma.cVProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...row },
    update: { ...row, pdfPath: null, pdfLanguage: null },
  });

  return NextResponse.json({ ok: true, skipped: false, profile });
}
