import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { CVParseError, parseCV } from "@/lib/cv-parser";
import { saveUserFile } from "@/lib/storage";
import { uploadLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const STAGING_TTL_MS = 60 * 60 * 1000; // 1h

/**
 * Public endpoint — staging CV prima del magic-link login.
 * Flow:
 *  1. Utente visita /optimize (logged-out).
 *  2. Compila CV + email + consenso → POST /api/optimize/stage
 *  3. Client chiama signIn("email") → magic link via Resend.
 *  4. Al primo signIn (anche su altro device) l'event adotta la staging row.
 *
 * NON crea il User: l'adapter NextAuth lo fa quando l'utente verifica email.
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit per IP (prevenire abuso pre-auth)
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";
    const rl = await uploadLimiter.limit(`stage-ip:${ip}`);
    if (!rl.success) {
      return NextResponse.json(
        { error: "rate_limit", message: "Troppe richieste. Riprova tra qualche minuto." },
        { status: 429 },
      );
    }

    const formData = await request.formData();
    const emailRaw = formData.get("email");
    const consentRaw = formData.get("privacyConsent");
    const file = formData.get("cv");

    const email =
      typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "validation", message: "Email non valida." },
        { status: 400 },
      );
    }
    if (consentRaw !== "true") {
      return NextResponse.json(
        { error: "validation", message: "Devi accettare la privacy policy." },
        { status: 400 },
      );
    }
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
    // Usiamo saveUserFile con un pseudo-userId "staging-<random>" — il file
    // verrà spostato al reale userId quando adottato.
    const stagingId = `staging-${randomBytes(12).toString("hex")}`;
    const storagePath = await saveUserFile(
      stagingId,
      "cv-source",
      file.name,
      buffer,
    );

    const expiresAt = new Date(Date.now() + STAGING_TTL_MS);
    const privacyConsentAt = new Date();

    // Upsert by email: se l'utente rifa il form, sovrascriviamo
    await prisma.pendingCvSubmission.upsert({
      where: { email },
      create: {
        email,
        originalFilename: file.name,
        storagePath,
        extractedText: text,
        privacyConsentAt,
        expiresAt,
      },
      update: {
        originalFilename: file.name,
        storagePath,
        extractedText: text,
        privacyConsentAt,
        expiresAt,
        createdAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    console.error("[/api/optimize/stage]", err);
    return NextResponse.json(
      { error: "internal", message: "Errore interno. Riprova." },
      { status: 500 },
    );
  }
}
