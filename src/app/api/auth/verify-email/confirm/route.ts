import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authLimiter } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

const Schema = z.object({
  token: z.string().min(32).max(128),
});

export async function POST(request: NextRequest) {
  try {
    if (!checkOrigin(request)) {
      return NextResponse.json(
        { error: "bad_origin" },
        { status: 403 },
      );
    }
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";
    const rl = await authLimiter.limit(`verify-confirm-ip:${ip}`);
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
        { error: "validation", message: "Token non valido." },
        { status: 400 },
      );
    }

    const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
    const record = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });

    if (
      !record ||
      record.usedAt !== null ||
      record.expiresAt.getTime() < Date.now()
    ) {
      return NextResponse.json(
        { error: "invalid_token", message: "Link scaduto o già usato. Richiedi un nuovo link." },
        { status: 400 },
      );
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { emailVerified: new Date() },
      }),
      prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/auth/verify-email/confirm]", err);
    return NextResponse.json(
      { error: "internal", message: "Errore interno. Riprova." },
      { status: 500 },
    );
  }
}
