import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authLimiter } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/csrf";
import { sendVerificationEmail } from "@/lib/email-verification";

export const runtime = "nodejs";

const Schema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export async function POST(request: NextRequest) {
  try {
    if (!checkOrigin(request)) {
      return NextResponse.json({ error: "bad_origin" }, { status: 403 });
    }
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";
    const rl = await authLimiter.limit(`verify-resend-ip:${ip}`);
    if (!rl.success) {
      return NextResponse.json(
        { error: "rate_limit", message: "Troppe richieste. Riprova tra qualche minuto." },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = Schema.safeParse(body);
    // Anti-enumeration: rispondi 200 anche se input invalido o user non esiste
    if (!parsed.success) return NextResponse.json({ ok: true });

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, email: true, emailVerified: true, passwordHash: true },
    });
    if (!user || !user.passwordHash || user.emailVerified) {
      return NextResponse.json({ ok: true });
    }

    await sendVerificationEmail(user.id, user.email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/auth/verify-email/resend]", err);
    return NextResponse.json({ ok: true });
  }
}
