import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { CVParseError, parseCV } from "@/lib/cv-parser";
import { saveUserFile } from "@/lib/storage";
import { uploadLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "unauthenticated", message: "Devi loggarti." },
        { status: 401 },
      );
    }

    const rl = await uploadLimiter.limit(`user:${user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { error: "rate_limit", message: "Troppe richieste. Riprova tra qualche minuto." },
        { status: 429 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("cv");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: "validation", message: "CV mancante." },
        { status: 400 },
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "validation", message: "File troppo grande (max 10 MB)." },
        { status: 400 },
      );
    }

    let text: string;
    try {
      text = await parseCV(file);
    } catch (err) {
      if (err instanceof CVParseError) {
        return NextResponse.json(
          { error: "parse_failed", message: err.message },
          { status: 422 },
        );
      }
      throw err;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = await saveUserFile(
      user.id,
      "cv-source",
      file.name,
      buffer,
    );

    // Estrazione profilo AI (best-effort, fallback interno a regex)
    let parsedProfileJson: string | null = null;
    try {
      const { extractProfileAI } = await import("@/lib/cv-profile-ai");
      const profile = await extractProfileAI(text, user.email);
      parsedProfileJson = JSON.stringify(profile);
    } catch (err) {
      console.warn("[/api/onboarding/cv] profile extraction failed", err);
    }

    await prisma.cVDocument.deleteMany({ where: { userId: user.id } });
    const cv = await prisma.cVDocument.create({
      data: {
        userId: user.id,
        originalFilename: file.name,
        storagePath,
        extractedText: text,
        parsedProfileJson,
      },
    });

    return NextResponse.json({
      ok: true,
      cvId: cv.id,
      preview: text.slice(0, 400),
      chars: text.length,
    });
  } catch (err) {
    console.error("[/api/onboarding/cv]", err);
    return NextResponse.json(
      {
        error: "internal",
        message: err instanceof Error ? err.message : "Errore",
      },
      { status: 500 },
    );
  }
}
