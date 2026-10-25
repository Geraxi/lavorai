import { trialEnd } from "@/lib/billing";
import { prisma } from "@/lib/db";
import { Resend } from "resend";
import { EMAIL_LOG_SUCCESS_WHERE, sendWithinQuota } from "@/lib/email-quota";
import { renderBrandEmail } from "@/lib/email-brand";
import { trialState } from "@/lib/billing";
import { isTestAccount } from "@/lib/admin";
import { trialLifecycleStage } from "@/lib/lifecycle-cadence";

/**
 * Finestra di prova dalla registrazione; accesso dopo conferma della carta.
 *
 *   - startTrial(userId): imposta trialEndsAt (grant admin per utenti esistenti)
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
    eyebrow: en ? "Complete your activation" : "Completa l’attivazione",
    preheader: en ? `Your trial window ends on ${ends}. Card setup is required.` : `La finestra di prova termina il ${ends}. È richiesta una carta.`,
    title: en ? "Your account is ready to set up" : "Il tuo account è pronto per il setup",
    greeting: f ? (en ? `Hi ${f},` : `Ciao ${f},`) : undefined,
    paragraphs: en
      ? [`Your trial window ends on <strong>${ends}</strong>, 7 days after signup. Add a card through Stripe before completing your profile and accessing Pro. Setup does not restart the trial.`, "Your selected plan renews at the end of the trial unless you cancel. Stripe shows the exact date and price before confirmation."]
      : [`La finestra di prova termina il <strong>${ends}</strong>, 7 giorni dopo la registrazione. Aggiungi una carta tramite Stripe prima di completare il profilo e accedere a Pro. Il setup non riavvia la prova.`, "Il piano scelto si rinnova al termine della prova salvo disdetta. Stripe mostra la data e il prezzo esatti prima della conferma."],
    bullets: en
      ? ["<strong>Add your card</strong> and wait for Stripe confirmation.", "<strong>Complete your CV and preferences</strong>, then review your tailored preview."]
      : ["<strong>Aggiungi la carta</strong> e attendi la conferma di Stripe.", "<strong>Completa CV e preferenze</strong>, poi controlla l’anteprima personalizzata."],
    highlights: [
      { label: en ? "Plan" : "Piano", value: "Pro" },
      { label: en ? "Ends" : "Scade", value: ends },
      { label: en ? "Card" : "Carta", value: en ? "Required" : "Obbligatoria" },
    ],
    cta: opts?.granted
      ? { label: en ? "Complete setup" : "Completa il setup", url: `${site()}/onboarding` }
      : { label: en ? "Open LavorAI" : "Apri LavorAI", url: `${site()}/dashboard` },
    secondary: { label: en ? "What Pro includes" : "Cosa include Pro", url: `${site()}/pricing` },
    footnote: en ? "When the trial ends, platform features are locked until you activate a subscription." : "Alla fine della prova le funzionalità sono bloccate finché non attivi un abbonamento.",
  });
  return sendWithinQuota(opts?.granted ? "trial_granted" : "trial_started", u.email, async () => {
    return new Resend(apiKey).emails.send({ from: from(), to: u.email, subject: opts?.granted ? (en ? "Pro is on for you, 7 days" : "Pro attivo per te, 7 giorni") : en ? "Your 7 days of Pro start now" : "I tuoi 7 giorni di Pro iniziano adesso", html, text });
  });
}

export interface TrialNudgeResult { day3: number; day6: number; ending: number; ended: number; skipped: number; details: string[] }

export async function runTrialNudges(opts?: { dryRun?: boolean }): Promise<TrialNudgeResult> {
  const res: TrialNudgeResult = { day3: 0, day6: 0, ending: 0, ended: 0, skipped: 0, details: [] };
  const apiKey = process.env.RESEND_API_KEY;
  const now = Date.now();
  const users = await prisma.user.findMany({
    where: { trialEndsAt: { not: null }, stripeSubscriptionId: null, suspendedAt: null, emailVerified: { not: null } },
    select: {
      id: true, email: true, name: true, locale: true, createdAt: true, trialEndsAt: true, trialGraceEndsAt: true, tier: true,
      preferences: { select: { rolesJson: true, autoApplyMode: true } },
      _count: { select: { cvDocuments: true, applications: { where: { status: "success" } } } },
    },
  });
  const logs = await prisma.emailLog.findMany({ where: { kind: { in: ["trial_ending", "trial_ended", "trial_day_3", "trial_day_6"] }, ...EMAIL_LOG_SUCCESS_WHERE }, select: { kind: true, to: true } });
  const sentKey = new Set(logs.map((l) => `${l.kind}:${l.to.toLowerCase()}`));

  for (const u of users) {
    u.trialEndsAt = trialEnd(u);
    if (isTestAccount(u.email) || !u.trialEndsAt || u.tier !== "free") continue;
    const en = u.locale === "en";
    const f = first(u.name);
    const stage = trialLifecycleStage({ now, createdAt: u.createdAt, trialEndsAt: u.trialEndsAt });
    const kind: "trial_day_3" | "trial_day_6" | "trial_ended" | null = stage === "day_3" ? "trial_day_3" : stage === "day_6" ? "trial_day_6" : stage === "ended" ? "trial_ended" : null;
    const emailKey = u.email.toLowerCase();
    // trial_ending was the previous name for the final-days reminder. Treat it
    // as already delivered so existing users never receive it twice.
    const alreadySent = kind === "trial_day_6"
      ? sentKey.has(`trial_day_6:${emailKey}`) || sentKey.has(`trial_ending:${emailKey}`)
      : kind ? sentKey.has(`${kind}:${emailKey}`) : false;
    if (!kind || alreadySent) continue;
    if (opts?.dryRun || !apiKey) { res.skipped++; res.details.push(`${u.email} ${kind} dry`); continue; }

    const pricing = `${site()}/settings#billing`;
    const hasCv = u._count.cvDocuments > 0;
    const hasRoles = (() => { try { return Array.isArray(JSON.parse(u.preferences?.rolesJson ?? "[]")) && JSON.parse(u.preferences?.rolesJson ?? "[]").length > 0; } catch { return false; } })();
    const sent = u._count.applications;
    const email = kind === "trial_day_3"
      ? renderBrandEmail({
          locale: u.locale,
          eyebrow: en ? "Pro trial · day 3" : "Prova Pro · giorno 3",
          preheader: en ? "A quick check-in to help LavorAI start working." : "Un controllo rapido per far iniziare a lavorare LavorAI.",
          title: en ? "Let’s get your search moving" : "Facciamo partire la tua ricerca",
          greeting: f ? (en ? `Hi ${f},` : `Ciao ${f},`) : undefined,
          paragraphs: en
            ? [!hasCv ? "Your search is waiting for a CV. Upload one now — even a first draft — and LavorAI can tailor it to each role." : !hasRoles ? "Your CV is ready. Add the roles and locations you want so LavorAI can find the right opportunities." : "Your profile is ready. Keep an eye on your dashboard as LavorAI scans for roles that fit your preferences."]
            : [!hasCv ? "La tua ricerca aspetta un CV. Caricalo ora — anche una prima bozza — e LavorAI potrà adattarlo a ogni ruolo." : !hasRoles ? "Il tuo CV è pronto. Aggiungi ruoli e località desiderati così LavorAI trova le opportunità giuste." : "Il tuo profilo è pronto. Controlla la dashboard mentre LavorAI cerca ruoli compatibili con le tue preferenze."],
          cta: { label: !hasCv ? (en ? "Upload your CV" : "Carica il CV") : !hasRoles ? (en ? "Set preferences" : "Imposta preferenze") : (en ? "Open dashboard" : "Apri dashboard"), url: !hasCv ? `${site()}/onboarding` : !hasRoles ? `${site()}/preferences` : `${site()}/dashboard` },
        })
      : kind === "trial_day_6"
      ? renderBrandEmail({
          locale: u.locale,
          eyebrow: en ? "Pro trial" : "Prova Pro",
          preheader: en ? "Your final trial days are here." : "Sei negli ultimi giorni della prova.",
          title: en ? "Your Pro trial is nearly over" : "La tua prova Pro sta per finire",
          greeting: f ? (en ? `Hi ${f},` : `Ciao ${f},`) : undefined,
          paragraphs: en
            ? [`On <strong>${fmt(u.trialEndsAt, en)}</strong> your trial expires and platform features are locked until you subscribe.`, sent > 0 ? `So far LavorAI has sent <strong>${sent} ${sent === 1 ? "application" : "applications"}</strong> on your behalf. Keeping that running is €19.99 a month, cancel any time.` : "Keeping the engine running is €19.99 a month, cancel any time from Settings."]
            : [`Il <strong>${fmt(u.trialEndsAt, en)}</strong> la prova scade e le funzionalità vengono bloccate finché non attivi un abbonamento.`, sent > 0 ? `Finora LavorAI ha inviato <strong>${sent} ${sent === 1 ? "candidatura" : "candidature"}</strong> a tuo nome. Continuare costa €19,99 al mese, disdici quando vuoi.` : "Continuare costa €19,99 al mese, disdici quando vuoi dalle Impostazioni."],
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
            ? ["Your free trial has expired. Subscribe to resume using LavorAI.", sent > 0 ? `During the trial LavorAI sent <strong>${sent} ${sent === 1 ? "application" : "applications"}</strong> for you. Pro picks up exactly where it left off.` : "Pro picks up exactly where the trial left off: 50 applications a month, CV and cover letter tailored to each one."]
            : ["La tua prova gratuita è scaduta. Attiva un abbonamento per tornare a utilizzare LavorAI.", sent > 0 ? `Durante la prova LavorAI ha inviato <strong>${sent} ${sent === 1 ? "candidatura" : "candidature"}</strong> per te. Con Pro riparte esattamente da dove si è fermato.` : "Con Pro riparte esattamente da dove si è fermato: 50 candidature al mese, CV e lettera su misura per ognuna."],
          highlights: [
            { label: "Pro", value: en ? "€19.99 / month" : "€19,99 / mese" },
            { label: en ? "Cancel" : "Disdetta", value: en ? "Any time, one click" : "Quando vuoi, un clic" },
          ],
          cta: { label: en ? "Restart with Pro" : "Riparti con Pro", url: pricing },
          secondary: { label: en ? "See this week's matches" : "Vedi le offerte di questa settimana", url: `${site()}/jobs` },
        });
    try {
      const r = await sendWithinQuota(kind, u.email, async () => {
        const subject = kind === "trial_day_3"
          ? (en ? "Let’s get your search moving" : "Facciamo partire la tua ricerca")
          : kind === "trial_day_6"
            ? (en ? "Your Pro trial is nearly over" : "La tua prova Pro sta per finire")
            : (en ? "Your Pro trial has ended" : "La tua prova Pro è finita");
        return new Resend(apiKey).emails.send({ from: from(), to: u.email, subject, html: email.html, text: email.text });
      });
      if (r.sent) { if (kind === "trial_day_3") res.day3++; else if (kind === "trial_day_6") { res.day6++; res.ending++; } else res.ended++; } else res.skipped++;
      res.details.push(`${u.email} ${kind} ${r.sent ? "sent" : r.reason}`);
    } catch (err) {
      res.skipped++;
      res.details.push(`${u.email} ${kind} error ${err instanceof Error ? err.message.slice(0, 60) : "?"}`);
    }
  }
  return res;
}

export { trialState };
