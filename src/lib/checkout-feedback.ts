import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { isTestAccount } from "@/lib/admin";
import { renderBrandEmail } from "@/lib/email-brand";
import { sendWithinQuota } from "@/lib/email-quota";

const site = () => process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";
const from = () => process.env.EMAIL_FROM ?? "LavorAI <noreply@lavorai.it>";
const POPUP_TITLE = "Cosa ti ha fermato?";

export type CheckoutFeedbackResult = {
  candidates: number;
  sent: number;
  skipped: number;
  details: Array<{ email: string; status: string }>;
};

async function ensureFeedbackPopup() {
  const active = await prisma.adminPopup.findFirst({
    where: { title: POPUP_TITLE, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: { createdAt: "desc" },
  });
  if (active) return active;
  return prisma.adminPopup.create({
    data: {
      title: POPUP_TITLE,
      body: "Hai iniziato il checkout ma non l’hai completato. Ci aiuti con una risposta? Prezzo, metodo di pagamento, fiducia, funzionalità mancanti, problema tecnico o altro: ogni dettaglio ci aiuta a migliorare LavorAI.",
      kind: "feedback",
      ctaLabel: "Invia il mio feedback",
      audience: "free",
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
    },
  });
}

/**
 * Invio manuale, una sola volta, a chi ha aperto un checkout ma non ha una
 * subscription Stripe attiva/in prova. La selezione usa eventi reali di
 * checkout, non semplici account free.
 */
export async function runCheckoutFeedbackCampaign(opts: { dryRun?: boolean } = {}): Promise<CheckoutFeedbackResult> {
  const result: CheckoutFeedbackResult = { candidates: 0, sent: 0, skipped: 0, details: [] };
  const apiKey = process.env.RESEND_API_KEY;
  const [starts, logs] = await Promise.all([
    prisma.conversionEvent.findMany({
      where: { name: "checkout_started", userId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: {
        userId: true,
        user: { select: { id: true, email: true, name: true, locale: true, stripeSubscriptionId: true, subscriptionStatus: true } },
      },
    }),
    prisma.emailLog.findMany({ where: { kind: "checkout_feedback" }, select: { to: true } }),
  ]);
  const alreadyContacted = new Set(logs.map((entry) => entry.to.toLowerCase()));
  const seen = new Set<string>();
  const candidates = starts.map((start) => start.user).filter((user): user is NonNullable<typeof user> => !!user).filter((user) => {
    if (seen.has(user.id)) return false;
    seen.add(user.id);
    const subscribed = user.stripeSubscriptionId && ["active", "trialing", "past_due"].includes(user.subscriptionStatus ?? "");
    return !subscribed && !isTestAccount(user.email) && !alreadyContacted.has(user.email.toLowerCase());
  });
  result.candidates = candidates.length;
  if (!opts.dryRun && candidates.length) await ensureFeedbackPopup();

  for (const user of candidates) {
    if (opts.dryRun || !apiKey) {
      result.skipped++;
      result.details.push({ email: user.email, status: opts.dryRun ? "dry_run" : "RESEND_API_KEY assente" });
      continue;
    }
    const en = user.locale === "en";
    const firstName = user.name?.trim().split(/\s+/)[0];
    const email = renderBrandEmail({
      locale: user.locale,
      eyebrow: en ? "A quick question from LavorAI" : "Una domanda veloce da LavorAI",
      preheader: en ? "What stopped you from completing checkout?" : "Cosa ti ha fermato prima di completare il checkout?",
      title: en ? "Can you help us improve?" : "Ci aiuti a migliorare?",
      greeting: firstName ? (en ? `Hi ${firstName},` : `Ciao ${firstName},`) : undefined,
      paragraphs: en
        ? ["You started choosing a LavorAI plan but did not complete checkout. This is not a payment reminder: we would genuinely like to understand what stopped you — pricing, trust, a missing feature, a technical issue, or something else.", "A short reply helps us make the platform better."]
        : ["Hai iniziato a scegliere un piano LavorAI ma non hai completato il checkout. Non è un sollecito di pagamento: vogliamo capire davvero cosa ti ha fermato — prezzo, fiducia, funzionalità mancanti, problema tecnico o altro.", "Una risposta breve ci aiuta a rendere la piattaforma migliore."],
      cta: { label: en ? "Share feedback" : "Lascia un feedback", url: `${site()}/start-membership?feedback=checkout` },
      secondary: { label: en ? "Continue when ready" : "Riprendi quando vuoi", url: `${site()}/start-membership` },
      footnote: en ? "You will only receive this request once." : "Riceverai questa richiesta una sola volta.",
    });
    try {
      const sent = await sendWithinQuota("checkout_feedback", user.email, async () => {
        const { error } = await new Resend(apiKey).emails.send({
          from: from(), to: user.email,
          subject: en ? "What stopped you from completing LavorAI?" : "Cosa ti ha fermato prima di completare LavorAI?",
          html: email.html, text: email.text,
        });
        if (error) throw new Error(JSON.stringify(error));
      });
      if (sent.sent) result.sent++; else result.skipped++;
      result.details.push({ email: user.email, status: sent.sent ? "sent" : (sent.reason ?? "skipped") });
    } catch (error) {
      result.skipped++;
      result.details.push({ email: user.email, status: `error: ${error instanceof Error ? error.message.slice(0, 100) : "unknown"}` });
    }
  }
  return result;
}
