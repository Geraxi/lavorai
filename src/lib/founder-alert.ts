import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { FOUNDER_EMAIL } from "@/lib/admin";

/**
 * Alert operativi al founder. Nasce dal post-mortem del 12/05: i crediti
 * Anthropic si sono esauriti e NESSUNO l'ha saputo per 11 giorni — ogni
 * candidatura falliva in silenzio. Mai più: quando il pipeline incontra un
 * errore "di sistema" (crediti finiti, API down) mandiamo subito un'email.
 *
 * Dedup: max 1 alert dello stesso tipo ogni ALERT_COOLDOWN_HOURS, così un
 * batch di 50 fallimenti non genera 50 email.
 */

const ALERT_COOLDOWN_HOURS = 6;

export type AlertReason =
  | "anthropic_credits"
  | "anthropic_error"
  | "resend_error"
  | "resend_reject"
  | "email_from_sandbox"
  | "other";

/** Riconosce un errore Anthropic di crediti/quota esauriti. */
export function isCreditExhaustedError(err: unknown): boolean {
  const msg = (
    err instanceof Error ? err.message : typeof err === "string" ? err : ""
  ).toLowerCase();
  return (
    msg.includes("credit balance is too low") ||
    msg.includes("insufficient") ||
    msg.includes("billing") ||
    (msg.includes("quota") && msg.includes("exceed"))
  );
}

/**
 * Invia un alert al founder, deduplicato per reason. Non lancia mai:
 * un fallimento dell'alert non deve rompere il worker.
 */
export async function alertFounder(
  reason: AlertReason,
  subject: string,
  detail: string,
): Promise<{ sent: boolean; skipped?: string }> {
  try {
    const cooldownSince = new Date(
      Date.now() - ALERT_COOLDOWN_HOURS * 3600_000,
    );
    // Dedup via EmailLog: tag il "to" con la reason così è specifico.
    const dedupKey = `${FOUNDER_EMAIL}#${reason}`;
    const recent = await prisma.emailLog.count({
      where: {
        kind: "founder_alert",
        to: dedupKey,
        createdAt: { gte: cooldownSince },
      },
    });
    if (recent > 0) return { sent: false, skipped: "cooldown" };

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { sent: false, skipped: "no_resend_key" };

    const resend = new Resend(apiKey);
    const from =
      process.env.EMAIL_FROM ?? "LavorAI <noreply@lavorai.it>";
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";

    const { error } = await resend.emails.send({
      from,
      to: FOUNDER_EMAIL,
      subject: `🚨 LavorAI alert: ${subject}`,
      text:
        `Alert operativo LavorAI\n\n` +
        `Tipo: ${reason}\n` +
        `${subject}\n\n` +
        `Dettaglio:\n${detail}\n\n` +
        `Controlla: ${siteUrl}/admin\n\n` +
        `(Questo alert è deduplicato: max 1 ogni ${ALERT_COOLDOWN_HOURS}h per tipo.)`,
      html: `<!doctype html><html><body style="font-family:-apple-system,Inter,sans-serif;color:#0F172A;max-width:560px;margin:0 auto;padding:24px;">
  <div style="font-size:13px;color:#dc2626;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">🚨 Alert operativo</div>
  <h1 style="font-size:19px;margin:6px 0 12px;">${escapeHtml(subject)}</h1>
  <p style="font-size:13px;color:#64748B;margin:0 0 4px;">Tipo: <code>${reason}</code></p>
  <pre style="background:#F1F5F9;border:1px solid #E2E8F0;border-radius:8px;padding:12px;font-size:12px;white-space:pre-wrap;overflow-x:auto;">${escapeHtml(detail)}</pre>
  <p style="font-size:13px;"><a href="${siteUrl}/admin" style="color:#16a34a;">Apri /admin →</a></p>
  <p style="font-size:11px;color:#94A3B8;">Dedup: max 1 ogni ${ALERT_COOLDOWN_HOURS}h per tipo.</p>
</body></html>`,
    });
    if (error) return { sent: false, skipped: JSON.stringify(error) };

    await prisma.emailLog.create({
      data: { kind: "founder_alert", to: dedupKey },
    });
    return { sent: true };
  } catch (e) {
    console.error("[founder-alert] failed", e);
    return { sent: false, skipped: "exception" };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
