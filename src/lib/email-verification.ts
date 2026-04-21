import { randomBytes, createHash } from "node:crypto";
import { Resend } from "resend";
import { prisma } from "@/lib/db";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Genera un token di verifica email e lo invia via Resend.
 * In dev senza RESEND_API_KEY stampa il link in console.
 * Best-effort: errori loggati ma non lanciati (signup non fallisce se l'email ha problemi).
 */
export async function sendVerificationEmail(
  userId: string,
  email: string,
): Promise<void> {
  try {
    const tokenPlain = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(tokenPlain).digest("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    // Invalida token verifica precedenti non ancora usati
    await prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });

    await prisma.emailVerificationToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const verifyUrl = `${siteUrl}/verify-email?token=${tokenPlain}`;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      if (process.env.NODE_ENV !== "production") {
        console.log(
          `\n\n🔑 [email-verify DEV] Verify link per ${email}:\n   ${verifyUrl}\n\n`,
        );
      } else {
        console.error("[email-verify] RESEND_API_KEY mancante in produzione");
      }
      return;
    }

    const resend = new Resend(apiKey);
    const from = process.env.EMAIL_FROM ?? "LavorAI <onboarding@resend.dev>";
    await resend.emails.send({
      from,
      to: email,
      subject: "Verifica la tua email LavorAI",
      html: renderVerifyEmail(verifyUrl),
      text: `Verifica la tua email:\n\n${verifyUrl}\n\nIl link scade tra 24 ore.`,
    });
  } catch (err) {
    console.error("[email-verify] send failed", err);
  }
}

function renderVerifyEmail(url: string): string {
  return `<!doctype html>
<html lang="it"><body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;color:#0F1012;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="font-size:18px;font-weight:700;margin-bottom:32px;">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:#0F1012;color:#fff;font-size:12px;border-radius:5px;margin-right:8px;vertical-align:-4px;font-family:ui-monospace,monospace;">L</span>
      LavorAI
    </div>
    <h1 style="font-size:22px;font-weight:600;margin:0 0 12px;">Verifica la tua email</h1>
    <p style="font-size:15px;line-height:1.5;color:#5B5D61;margin:0 0 24px;">
      Benvenuto in LavorAI. Conferma che questa email è davvero tua cliccando il bottone qui sotto — serve a proteggere il tuo account.
    </p>
    <a href="${url}" style="display:inline-block;background:#0F1012;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:500;font-size:14px;">Verifica email</a>
    <p style="font-size:12.5px;color:#8A8C90;margin:28px 0 0;line-height:1.5;">
      Il link scade tra 24 ore. Se non hai creato tu un account, ignora questa email.
    </p>
    <hr style="border:none;border-top:1px solid #E6E4DD;margin:32px 0 16px;"/>
    <p style="font-size:11px;color:#8A8C90;line-height:1.5;margin:0;">
      Copia il link nel browser:<br/>
      <span style="word-break:break-all;color:#5B5D61;">${url}</span>
    </p>
  </div>
</body></html>`;
}
