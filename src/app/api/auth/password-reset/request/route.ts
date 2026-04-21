import { NextResponse, type NextRequest } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { authLimiter } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

const Schema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 min

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
    const rl = await authLimiter.limit(`pwreset-ip:${ip}`);
    if (!rl.success) {
      return NextResponse.json(
        { error: "rate_limit", message: "Troppe richieste. Riprova tra qualche minuto." },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      // Anti-enumeration: rispondi ok anche con email malformata
      return NextResponse.json({ ok: true });
    }
    const { email } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    // Anti-enumeration: rispondi sempre 200 anche se user non esiste.
    // Utenti magic-link-only (senza passwordHash) possono impostare
    // una password per la prima volta via questo flow.
    if (!user) {
      return NextResponse.json({ ok: true });
    }

    // Genera token random, salva solo l'hash (token plaintext NON va in DB)
    const tokenPlain = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(tokenPlain).digest("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    // Invalida token vecchi pending
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const resetUrl = `${siteUrl}/reset-password?token=${tokenPlain}`;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      // Dev fallback
      if (process.env.NODE_ENV !== "production") {
        console.log(`\n\n🔑 [pw-reset DEV] Reset link per ${email}:\n   ${resetUrl}\n\n`);
      } else {
        console.error("[pw-reset] RESEND_API_KEY mancante in produzione");
      }
    } else {
      const resend = new Resend(apiKey);
      const from = process.env.EMAIL_FROM ?? "LavorAI <onboarding@resend.dev>";
      await resend.emails
        .send({
          from,
          to: email,
          subject: "Reimposta la tua password LavorAI",
          html: renderResetEmail(resetUrl),
          text: `Reimposta la password:\n\n${resetUrl}\n\nIl link scade tra 30 minuti.`,
        })
        .catch((err) => console.error("[pw-reset] resend error", err));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/auth/password-reset/request]", err);
    return NextResponse.json({ ok: true }); // non rivelare errori interni
  }
}

function renderResetEmail(url: string): string {
  return `<!doctype html>
<html lang="it"><body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;color:#0F1012;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="font-size:18px;font-weight:700;margin-bottom:32px;">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:#0F1012;color:#fff;font-size:12px;border-radius:5px;margin-right:8px;vertical-align:-4px;font-family:ui-monospace,monospace;">L</span>
      LavorAI
    </div>
    <h1 style="font-size:22px;font-weight:600;margin:0 0 12px;">Reimposta la tua password</h1>
    <p style="font-size:15px;line-height:1.5;color:#5B5D61;margin:0 0 24px;">
      Abbiamo ricevuto una richiesta di reset password per il tuo account. Clicca il bottone qui sotto per scegliere una nuova password.
    </p>
    <a href="${url}" style="display:inline-block;background:#0F1012;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:500;font-size:14px;">Reimposta password</a>
    <p style="font-size:12.5px;color:#8A8C90;margin:28px 0 0;line-height:1.5;">
      Il link scade tra 30 minuti. Se non hai richiesto tu questo reset, ignora questa email — la tua password resta invariata.
    </p>
    <hr style="border:none;border-top:1px solid #E6E4DD;margin:32px 0 16px;"/>
    <p style="font-size:11px;color:#8A8C90;line-height:1.5;margin:0;">
      Problemi? Copia questo link nel browser:<br/>
      <span style="word-break:break-all;color:#5B5D61;">${url}</span>
    </p>
  </div>
</body></html>`;
}
