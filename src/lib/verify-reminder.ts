import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { sendWithinQuota } from "@/lib/email-quota";
import { renderBrandEmail } from "@/lib/email-brand";
import { createVerificationUrl } from "@/lib/email-verification";
import { isTestAccount } from "@/lib/admin";
import {
  isVerifyReminderDue,
  VERIFY_REMINDER_MAX_AGE_MS,
  VERIFY_REMINDER_MIN_AGE_MS,
} from "@/lib/lifecycle-cadence";

/**
 * Promemoria verifica email (~24h dopo il signup) per chi non ha ancora
 * confermato l'indirizzo. Il link della email di signup scade dopo 24h,
 * quindi il promemoria genera un token NUOVO e lo include nel bottone.
 *
 * Regole:
 *  - solo account con password (gli utenti OAuth nascono già verificati)
 *  - mai account test/interni o sospesi
 *  - una sola volta per utente: dedup su EmailLog kind "verify_reminder"
 *  - rispetta la quota platform-wide (sendWithinQuota)
 *  - finestra 24h → 7gg dall'iscrizione; oltre non insistiamo
 *    (ci pensano eventualmente gli onboarding nudge)
 */

const DEFAULT_BATCH_CAP = 50;
const site = () => process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";
const from = () => process.env.EMAIL_FROM ?? "LavorAI <noreply@lavorai.it>";
const first = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || null;

export interface VerifyReminderResult {
  sent: number;
  skipped: number;
  candidates: number;
  details: string[];
}

export function renderVerifyReminder(input: {
  name: string | null;
  locale: string | null;
  verifyUrl: string;
}): { subject: string; html: string; text: string } {
  const en = input.locale === "en";
  const f = first(input.name);
  const subject = en
    ? "Confirm your email to keep using LavorAI"
    : "Conferma la tua email per continuare con LavorAI";
  const { html, text } = renderBrandEmail({
    locale: input.locale,
    eyebrow: en ? "One step left" : "Manca un passo",
    preheader: en
      ? "Confirm your email so LavorAI can start sending applications for you."
      : "Conferma la tua email così LavorAI può iniziare a inviare candidature per te.",
    title: en ? "Confirm your email" : "Conferma la tua email",
    greeting: f ? (en ? `Hi ${f},` : `Ciao ${f},`) : undefined,
    paragraphs: en
      ? [
          "You created your LavorAI account, but your email isn't confirmed yet. We need it before sending your <strong>first application</strong>: that's where recruiters' replies will arrive.",
          "It takes one click. The previous link has expired, so here's a new one:",
        ]
      : [
          "Hai creato il tuo account LavorAI, ma la tua email non è ancora confermata. Ci serve prima di inviare la tua <strong>prima candidatura</strong>: è lì che arriveranno le risposte dei recruiter.",
          "Basta un clic. Il link precedente è scaduto, eccone uno nuovo:",
        ],
    cta: { label: en ? "Confirm email" : "Conferma email", url: input.verifyUrl },
    secondary: { label: en ? "Open LavorAI" : "Apri LavorAI", url: `${site()}/dashboard` },
    footnote: en
      ? "The link expires in 24 hours. If you didn't create a LavorAI account, ignore this email: we won't send another reminder."
      : "Il link scade tra 24 ore. Se non hai creato tu un account LavorAI, ignora questa email: non ti invieremo altri promemoria.",
  });
  return { subject, html, text };
}

export async function runVerifyEmailReminders(opts?: {
  dryRun?: boolean;
  onlyEmail?: string;
  cap?: number;
}): Promise<VerifyReminderResult> {
  const res: VerifyReminderResult = { sent: 0, skipped: 0, candidates: 0, details: [] };
  const now = Date.now();
  const users = await prisma.user.findMany({
    where: {
      emailVerified: null,
      passwordHash: { not: null },
      suspendedAt: null,
      createdAt: {
        lte: new Date(now - VERIFY_REMINDER_MIN_AGE_MS),
        gte: new Date(now - VERIFY_REMINDER_MAX_AGE_MS),
      },
      ...(opts?.onlyEmail ? { email: opts.onlyEmail } : {}),
    },
    select: { id: true, email: true, name: true, locale: true, createdAt: true, emailVerified: true },
    orderBy: { createdAt: "asc" },
  });

  const logs = users.length
    ? await prisma.emailLog.findMany({
        where: { kind: "verify_reminder", to: { in: users.map((u) => u.email) } },
        select: { to: true },
      })
    : [];
  const already = new Set(logs.map((l) => l.to.toLowerCase()));

  const due = users.filter(
    (u) =>
      !isTestAccount(u.email) &&
      !already.has(u.email.toLowerCase()) &&
      isVerifyReminderDue({ now, createdAt: u.createdAt, emailVerified: u.emailVerified }),
  );
  res.candidates = due.length;
  const batch = due.slice(0, opts?.cap ?? DEFAULT_BATCH_CAP);

  const apiKey = process.env.RESEND_API_KEY;
  if (opts?.dryRun || !apiKey) {
    for (const u of batch) {
      res.skipped++;
      res.details.push(`${u.email} verify_reminder ${opts?.dryRun ? "dry" : "no_resend_key"}`);
    }
    return res;
  }
  const resend = new Resend(apiKey);

  for (const u of batch) {
    try {
      const r = await sendWithinQuota("verify_reminder", u.email, async () => {
        // Token creato solo quando la quota consente l'invio, così non
        // invalidiamo link esistenti per un'email che non partirà.
        const verifyUrl = await createVerificationUrl(u.id);
        const { subject, html, text } = renderVerifyReminder({ name: u.name, locale: u.locale, verifyUrl });
        const { error } = await resend.emails.send({ from: from(), to: u.email, subject, html, text });
        if (error) throw new Error(JSON.stringify(error));
      });
      if (r.sent) res.sent++;
      else res.skipped++;
      res.details.push(`${u.email} verify_reminder ${r.sent ? "sent" : r.reason}`);
    } catch (err) {
      res.skipped++;
      res.details.push(
        `${u.email} verify_reminder error ${err instanceof Error ? err.message.slice(0, 60) : "?"}`,
      );
    }
  }
  return res;
}
