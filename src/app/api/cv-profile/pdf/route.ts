import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { rowToProfile } from "@/lib/cv-profile-types";
import { renderCVPdf } from "@/lib/cv-pdf";
import { saveUserFile, readUserFile } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cv-profile/pdf?lang=it|en
 * Rende (e cache-a) il CV base in PDF e lo restituisce come download.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const langParam = request.nextUrl.searchParams.get("lang");
  const lang: "it" | "en" = langParam === "en" ? "en" : "it";

  const row = await prisma.cVProfile.findUnique({
    where: { userId: user.id },
  });
  if (!row) {
    return NextResponse.json(
      { error: "no_profile", message: "Compila prima il tuo profilo CV." },
      { status: 409 },
    );
  }

  let buffer: Buffer;
  if (row.pdfPath && row.pdfLanguage === lang) {
    try {
      buffer = await readUserFile(row.pdfPath);
    } catch {
      buffer = await renderAndSave();
    }
  } else {
    buffer = await renderAndSave();
  }

  const safeName =
    [row.firstName, row.lastName]
      .filter(Boolean)
      .join("_")
      .replace(/[^a-zA-Z0-9_-]+/g, "_") || "CV";

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="CV_${safeName}_${lang}.pdf"`,
      "Cache-Control": "private, max-age=0, no-store",
    },
  });

  async function renderAndSave(): Promise<Buffer> {
    const profile = rowToProfile(row!);
    let photoBuffer: Buffer | null = null;
    let photoMime: string | undefined;
    if (row!.photoPath) {
      try {
        photoBuffer = await readUserFile(row!.photoPath);
        photoMime = row!.photoPath.endsWith(".png")
          ? "image/png"
          : row!.photoPath.endsWith(".webp")
            ? "image/webp"
            : "image/jpeg";
      } catch {
        photoBuffer = null;
      }
    }
    const buf = await renderCVPdf(profile, lang, photoBuffer, photoMime);
    const path = await saveUserFile(
      user!.id,
      "cv-profile",
      `CV_base_${lang}.pdf`,
      buf,
    );
    await prisma.cVProfile.update({
      where: { userId: user!.id },
      data: { pdfPath: path, pdfLanguage: lang },
    });
    return buf;
  }
}
