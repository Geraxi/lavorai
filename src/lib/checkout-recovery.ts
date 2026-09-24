import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { isTestAccount } from "@/lib/admin";
import { renderBrandEmail } from "@/lib/email-brand";
import { sendWithinQuota } from "@/lib/email-quota";
import { isCheckoutRecoveryWindow } from "@/lib/lifecycle-cadence";

const site = () => process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";
const from = () => process.env.EMAIL_FROM ?? "LavorAI <noreply@lavorai.it>";

export interface CheckoutRecoveryResult { sent: number; skipped: number; details: string[] }

/**
 * A gentle, single reminder for a real checkout that was opened but never
 * converted. We link back to billing instead of retaining or reusing a
 * Stripe Checkout URL, so payment details always stay on Stripe.
 */
export async function runCheckoutRecovery(opts?: { dryRun?: boolean }): Promise<CheckoutRecoveryResult> {
  const result: CheckoutRecoveryResult = { sent: 0, skipped: 0, details: [] };
  const apiKey = process.env.RESEND_API_KEY;
  const now = Date.now();
  const [starts, sentLogs] = await Promise.all([
    prisma.conversionEvent.findMany({
      where: {
        name: "checkout_started",
        createdAt: { gte: new Date(now - 72 * 3_600_000), lte: new Date(now - 2 * 3_600_000) },
        userId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        user: { select: { id: true, email: true, name: true, locale: true, stripeSubscriptionId: true, subscriptionStatus: true } },
      },
    }),
    prisma.emailLog.findMany({
      where: { kind: "checkout_recovery", createdAt: { gte: new Date(now - 14 * 86_400_000) } },
      select: { to: true },
    }),
  ]);
  const alreadySent = new Set(sentLogs.map((entry) => entry.to.toLowerCase()));
  const seenUsers = new Set<string>();

  for (const start of starts) {
    const user = start.user;
    if (!user || seenUsers.has(user.id)) continue;
    seenUsers.add(user.id);
    const paid = user.stripeSubscriptionId && ["active", "trialing", "past_due"].includes(user.subscriptionStatus ?? "");
    if (!isCheckoutRecoveryWindow(start.createdAt, now) || paid || isTestAccount(user.email) || alreadySent.has(user.email.toLowerCase())) {
      result.skipped++;
      continue;
    }
    if (opts?.dryRun || !apiKey) {
      result.skipped++;
      result.details.push(`${user.email} checkout_recovery dry`);
      continue;
    }
    const en = user.locale === "en";
    const name = user.name?.trim().split(/\s+/)[0];
    const email = renderBrandEmail({
      locale: user.locale,
      eyebrow: en ? "Your LavorAI plan" : "Il tuo piano LavorAI",
      preheader: en ? "Your Pro checkout is still ready when you are." : "Il checkout Pro è pronto quando lo sei tu.",
      title: en ? "Continue where you left off" : "Riprendi da dove avevi lasciato",
      greeting: name ? (en ? `Hi ${name},` : `Ciao ${name},`) : undefined,
      paragraphs: en
        ? ["You were one step away from continuing with Pro. Your trial remains unchanged; when you are ready, return to Settings to choose your plan and complete payment securely with Stripe."]
        : ["Eri a un passo dal continuare con Pro. La tua prova resta invariata; quando vuoi, torna nelle Impostazioni per scegliere il piano e completare il pagamento in modo sicuro con Stripe."],
      cta: { label: en ? "Continue with Pro" : "Continua con Pro", url: `${site()}/settings#billing` },
      secondary: { label: en ? "Review your applications" : "Rivedi le tue candidature", url: `${site()}/applications` },
      footnote: en ? "No payment details are stored by LavorAI." : "LavorAI non conserva i dati di pagamento.",
    });
    try {
      const sent = await sendWithinQuota("checkout_recovery", user.email, async () => {
        const { error } = await new Resend(apiKey).emails.send({
          from: from(), to: user.email,
          subject: en ? "Continue with Pro when you’re ready" : "Continua con Pro quando vuoi",
          html: email.html, text: email.text,
        });
        if (error) throw new Error(JSON.stringify(error));
      });
      if (sent.sent) result.sent++; else result.skipped++;
      result.details.push(`${user.email} checkout_recovery ${sent.sent ? "sent" : sent.reason}`);
    } catch (error) {
      result.skipped++;
      result.details.push(`${user.email} checkout_recovery error ${error instanceof Error ? error.message.slice(0, 60) : "?"}`);
    }
  }
  return result;
}
