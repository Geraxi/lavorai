import { prisma } from "@/lib/db";
import { Resend } from "resend";
import { sendWithinQuota } from "@/lib/email-quota";
import { renderBrandEmail } from "@/lib/email-brand";
import { trialState } from "@/lib/billing";
import { isTestAccount } from "@/lib/admin";

/**
 * Prova Pro gratuita senza carta: 7 giorni dalla registrazione.
 *
 *   - startTrial(userId): imposta trialEndsAt (usato dal signup e dal
 *     grant admin per gli utenti esistenti)
 *   - sendTrialStartedEmail: giorno 0
 *   - runTrialNudges (cron giornaliero): "finisce tra 2 giorni" e
 *     "è finita" — una volta sola per utente (EmailLog)
 */

export const TRIAL_DAYS = 7;
const site = () => process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";
const from = () => process.env.EMAIL_FROM ?? "LavorAI <noreply@lavorai.it>";

export async function startTrial(userId: string, days = TRIAL_DAYS): Promise<Date> {
  const ends = new Date(Date.now() + days * 86400_000);
  await prisma.user.update({ where: { id: userId }, data: { trialEndsAt: ends } });
  return ends;
}

const fmt = (d: Date, en: boolean) => d.toLocaleDateString(en ? "en-GB" : "it-IT", { weekday: "long", day: "numeric", month: "long" });
const first = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || null;

export async function sendTrialStartedEmail(u: { id: string; email: string; name: string | null; locale: string | null; trialEndsAt: Date | null }, opts?: { granted?: boolean }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !u.trialEndsAt) return { sent: false, reason: "no_key_or_trial" };
  const en = u.locale === "en";
  const f = first(u.name);
  const ends = fmt(u.trialEndsAt, en);
  const { html, text } = renderBrandEmail({
    locale: u.locale,
    eyebrow: en ? "Pro trial · day 1" : "Prova Pro · giorno 1",
    preheader: en ? `Full Pro until ${ends}. No card needed.` : `Pro completo fino a ${ends}. Nessuna carta richiesta.`,
    title: opts?.granted
      ? en ? "We turned on Pro for you, for 7 days" : "Ti abbiamo attivato Pro per 7 giorni"
      : en ? "Your 7 days of Pro start now" : "I tuoi 7 giorni di Pro iniziano adesso",
    greeting: f ? (en ? `Hi ${f},` : `Ciao ${f},`) : undefined,
    paragraphs: opts?.granted
      ? en
        ? [`You signed up when LavorAI still had a limited free plan. From today, and until <strong>${ends}</strong>, your account runs on full Pro: automatic applications every day, tailored CV and cover letter, replies in your Inbox.`, "No card, nothing to do. If it works for you, you can continue with Pro afterwards."]
        : [`Ti sei iscritto quando LavorAI aveva ancora un piano gratuito limitato. Da oggi, e fino a <strong>${ends}</strong>, il tuo account gira su Pro completo: candidature automatiche ogni giorno, CV e lettera su misura, risposte nella tua Inbox.`, "Nessuna carta, niente da fare. Se funziona per te, dopo potrai continuare con Pro."]
      : en
        ? [`Until <strong>${ends}</strong> your account runs on full Pro: LavorAI finds the jobs matching your profile, adapts your CV and cover letter, and applies for you every day. No card needed.`, "To get the most out of it, do these two things today:"]
        : [`Fino a <strong>${ends}</strong> il tuo account gira su Pro completo: LavorAI trova le offerte compatibili con il tuo profilo, adatta CV e lettera, e si candida per te ogni giorno. Nessuna carta richiesta.`, "Per sfruttarla al massimo, fai queste due cose oggi:"],
    bullets: opts?.granted
      ? undefined
      : en
        ? ["<strong>Upload your CV</strong>, even a rough one: we rewrite it for every job.", "<strong>Set 1 to 3 roles and a city</strong> in Preferences. Everything else is automatic."]
        : ["<strong>Carica il CV</strong>, anche grezzo: lo riscriviamo per ogni annuncio.", "<strong>Imposta 1-3 ruoli e una città</strong> nelle Preferenze. Il resto è automatico."],
    highlights: [
      { label: en ? "Plan" : "Piano", value: "Pro" },
      { label: en ? "Ends" : "Scade", value: ends },
      { label: en ? "Card" : "Carta", value: en ? "Not required" : "Non richiesta" },
    ],
    cta: { label: en ? "Open LavorAI" : "Apri LavorAI", url: `${site()}/dashboard` },
    secondary: { label: en ? "What Pro includes" : "Cosa include Pro", url: `${site()}/pricing` },
    footnote: en ? "When the trial ends, your account switches to view-only: you keep seeing matches and replies, but no application is sent until you choose Pro." : "Alla fine della prova l'account passa in sola visualizzazione: continui a vedere offerte e risposte, ma nessuna candidatura parte finché non scegli Pro.",
  });
  return sendWithinQuota(opts?.granted ? "trial_granted" : "trial_started", u.email, async () => {
    const { error } = await new Resend(apiKey).emails.send({ from: from(), to: u.email, subject: opts?.granted ? (en ? "Pro is on for you, 7 days" : "Pro attivo per te, 7 giorni") : en ? "Your 7 days of Pro start now" : "I tuoi 7 giorni di Pro iniziano adesso", html, text });
    if (error) throw new Error(JSON.stringify(error));
  });
}

export interface TrialNudgeResult { ending: number; ended: number; skipped: number; details: string[] }

export async function runTrialNudges(opts?: { dryRun?: boolean }): Promise<TrialNudgeResult> {
  const res: TrialNudgeResult = { ending: 0, ended: 0, skipped: 0, details: [] };
  const apiKey = process.env.RESEND_API_KEY;
  const now = Date.now();
  const users = await prisma.user.findMany({
    where: { trialEndsAt: { not: null }, stripeSubscriptionId: null, suspendedAt: null, emailVerified: { not: null } },
    select: { id: true, email: true, name: true, locale: true, trialEndsAt: true, tier: true, _count: { select: { applications: { where: { status: "success" } } } } },
  });
  const logs = await prisma.emailLog.findMany({ where: { kind: { in: ["trial_ending", "trial_ended"] } }, select: { kind: true, to: true } });
  const sentKey = new Set(logs.map((l) => `${l.kind}:${l.to.toLowerCase()}`));

  for (const u of users) {
    if (isTestAccount(u.email) || !u.trialEndsAt || u.tier !== "free") continue;
    const en = u.locale === "en";
    const f = first(u.name);
    const msLeft = u.trialEndsAt.getTime() - now;
    const daysLeft = Math.ceil(msLeft / 86400_000);
    let kind: "trial_ending" | "trial_ended" | null = null;
    if (msLeft > 0 && daysLeft <= 2) kind = "trial_ending";
    else if (msLeft <= 0 && msLeft > -3 * 86400_000) kind = "trial_ended";
    if (!kind || sentKey.has(`${kind}:${u.email.toLowerCase()}`)) continue;
    if (opts?.dryRun || !apiKey) { res.skipped++; res.details.push(`${u.email} ${kind} dry`); continue; }

    const sent = u._count.applications;
    const pricing = `${site()}/settings#billing`;
    const email = kind === "trial_ending"
      ? renderBrandEmail({
          locale: u.locale,
          eyebrow: en ? "Pro trial" : "Prova Pro",
          preheader: en ? "2 days left, then view-only." : "2 giorni, poi sola visualizzazione.",
          title: en ? "Your Pro trial ends in 2 days" : "La tua prova Pro finisce tra 2 giorni",
          greeting: f ? (en ? `Hi ${f},` : `Ciao ${f},`) : undefined,
          paragraphs: en
            ? [`On <strong>${fmt(u.trialEndsAt, en)}</strong> your account switches to view-only: you keep seeing matches and replies, but LavorAI stops applying for you.`, sent > 0 ? `So far LavorAI has sent <strong>${sent} ${sent === 1 ? "application" : "applications"}</strong> on your behalf. Keeping that running is €19.99 a month, cancel any time.` : "Keeping the engine running is €19.99 a month, cancel any time from Settings."]
            : [`Il <strong>${fmt(u.trialEndsAt, en)}</strong> il tuo account passa in sola visualizzazione: continui a vedere offerte e risposte, ma LavorAI smette di candidarsi per te.`, sent > 0 ? `Finora LavorAI ha inviato <strong>${sent} ${sent === 1 ? "candidatura" : "candidature"}</strong> a tuo nome. Continuare costa €19,99 al mese, disdici quando vuoi.` : "Continuare costa €19,99 al mese, disdici quando vuoi dalle Impostazioni."],
          cta: { label: en ? "Continue with Pro" : "Continua con Pro", url: pricing },
          secondary: { label: en ? "See what was sent" : "Vedi cosa è stato inviato", url: `${site()}/inbox` },
        })
      : renderBrandEmail({
          locale: u.locale,
          eyebrow: en ? "Pro trial" : "Prova Pro",
          preheader: en ? "Applications are paused. Matches keep coming." : "Le candidature sono in pausa. Le offerte continuano ad arrivare.",
          title: en ? "Your Pro trial has ended" : "La tua prova Pro è finita",
          greeting: f ? (en ? `Hi ${f},` : `Ciao ${f},`) : undefined,
          paragraphs: en
            ? ["Your account is now view-only. LavorAI keeps finding the jobs matching your profile and you keep receiving replies to what was already sent, but nothing new goes out.", sent > 0 ? `During the trial LavorAI sent <strong>${sent} ${sent === 1 ? "application" : "applications"}</strong> for you. Pro picks up exactly where it left off.` : "Pro picks up exactly where the trial left off: 50 applications a month, CV and cover letter tailored to each one."]
            : ["Il tuo account è ora in sola visualizzazione. LavorAI continua a trovare le offerte compatibili con il tuo profilo e ricevi le risposte a ciò che è già stato inviato, ma nulla di nuovo parte.", sent > 0 ? `Durante la prova LavorAI ha inviato <strong>${sent} ${sent === 1 ? "candidatura" : "candidature"}</strong> per te. Con Pro riparte esattamente da dove si è fermato.` : "Con Pro riparte esattamente da dove si è fermato: 50 candidature al mese, CV e lettera su misura per ognuna."],
          highlights: [
            { label: "Pro", value: en ? "€19.99 / month" : "€19,99 / mese" },
            { label: en ? "Cancel" : "Disdetta", value: en ? "Any time, one click" : "Quando vuoi, un clic" },
          ],
          cta: { label: en ? "Restart with Pro" : "Riparti con Pro", url: pricing },
          secondary: { label: en ? "See this week's matches" : "Vedi le offerte di questa settimana", url: `${site()}/jobs` },
        });
    try {
      const r = await sendWithinQuota(kind, u.email, async () => {
        const { error } = await new Resend(apiKey).emails.send({ from: from(), to: u.email, subject: kind === "trial_ending" ? (en ? "Your Pro trial ends in 2 days" : "La tua prova Pro finisce tra 2 giorni") : en ? "Your Pro trial has ended" : "La tua prova Pro è finita", html: email.html, text: email.text });
        if (error) throw new Error(JSON.stringify(error));
      });
      if (r.sent) { if (kind === "trial_ending") res.ending++; else res.ended++; } else res.skipped++;
      res.details.push(`${u.email} ${kind} ${r.sent ? "sent" : r.reason}`);
    } catch (err) {
      res.skipped++;
      res.details.push(`${u.email} ${kind} error ${err instanceof Error ? err.message.slice(0, 60) : "?"}`);
    }
  }
  return res;
}

export { trialState };
