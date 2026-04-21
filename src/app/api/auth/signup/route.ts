import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { authLimiter } from "@/lib/rate-limit";
import { validatePassword } from "@/lib/password-policy";
import { checkOrigin } from "@/lib/csrf";
import { sendVerificationEmail } from "@/lib/email-verification";

export const runtime = "nodejs";

const SignupSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(100),
  name: z.string().trim().max(80).optional(),
  privacyConsent: z.literal(true),
});

export async function POST(request: NextRequest) {
  try {
    if (!checkOrigin(request)) {
      return NextResponse.json(
        { error: "bad_origin", message: "Richiesta non autorizzata." },
        { status: 403 },
      );
    }
    // Rate limit per IP
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";
    const rl = await authLimiter.limit(`signup-ip:${ip}`);
    if (!rl.success) {
      return NextResponse.json(
        {
          error: "rate_limit",
          message: "Troppi tentativi. Riprova tra qualche minuto.",
        },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = SignupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation", message: "Email o dati non validi." },
        { status: 400 },
      );
    }

    const { email, password, name } = parsed.data;

    const pwCheck = validatePassword(password);
    if (!pwCheck.ok) {
      return NextResponse.json(
        { error: "weak_password", message: pwCheck.message },
        { status: 400 },
      );
    }

    // Blocca signup se email è GIÀ registrata in qualunque forma
    // (con o senza password, con o senza CV/candidature).
    // Un utente che vuole "nuovo account" con stessa email deve prima
    // cancellare quello esistente.
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: "email_taken",
          message:
            "Un account con questa email esiste già. Accedi invece.",
        },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const privacyConsentAt = new Date();

    const user = await prisma.user.create({
      data: {
        email,
        name: name ?? null,
        passwordHash,
        emailVerified: null,
        privacyConsentAt,
      },
      select: { id: true, email: true },
    });

    // Invia email di verifica (best-effort; non blocca signup se fallisce)
    await sendVerificationEmail(user.id, user.email);

    return NextResponse.json({ ok: true, verifyRequired: true });
  } catch (err) {
    console.error("[/api/auth/signup]", err);
    return NextResponse.json(
      { error: "internal", message: "Errore interno. Riprova." },
      { status: 500 },
    );
  }
}
