import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { authLimiter } from "@/lib/rate-limit";
import { validatePassword } from "@/lib/password-policy";
import { checkOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

const Schema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(1).max(100),
});

export async function POST(request: NextRequest) {
  try {
    if (!checkOrigin(request)) {
      return NextResponse.json(
        { error: "bad_origin", message: "Richiesta non autorizzata." },
        { status: 403 },
      );
    }
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";
    const rl = await authLimiter.limit(`pwreset-confirm-ip:${ip}`);
    if (!rl.success) {
      return NextResponse.json(
        { error: "rate_limit", message: "Troppe richieste. Riprova tra qualche minuto." },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation", message: "Token o password non validi." },
        { status: 400 },
      );
    }

    const { token, password } = parsed.data;

    const pwCheck = validatePassword(password);
    if (!pwCheck.ok) {
      return NextResponse.json(
        { error: "weak_password", message: pwCheck.message },
        { status: 400 },
      );
    }
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (
      !record ||
      record.usedAt !== null ||
      record.expiresAt.getTime() < Date.now()
    ) {
      return NextResponse.json(
        { error: "invalid_token", message: "Link scaduto o non valido. Richiedi un nuovo reset." },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Transaction: aggiorna password + marca token usato + invalida sessioni esistenti
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Con JWT strategy le sessioni esistenti restano valide fino a scadenza
      // del token. Per sicurezza massima dopo password reset, conviene
      // forzare re-login invalidando tutte le Session del DB (che NextAuth
      // v5 usa per il credentials lookup in adapter).
      prisma.session.deleteMany({ where: { userId: record.userId } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/auth/password-reset/confirm]", err);
    return NextResponse.json(
      { error: "internal", message: "Errore interno. Riprova." },
      { status: 500 },
    );
  }
}
