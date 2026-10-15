import { trialEnd } from "@/lib/billing";
import { prisma } from "@/lib/db";
import { Resend } from "resend";
import { sendWithinQuota } from "@/lib/email-quota";
import { renderBrandEmail } from "@/lib/email-brand";
import { trialState } from "@/lib/billing";
import { isTestAccount } from "@/lib/admin";
import { trialLifecycleStage } from "@/lib/lifecycle-cadence";

/** Welcome for new plans and reminders only for pre-existing stored trials. */
const site = () => process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";
const from = () => process.env.EMAIL_FROM ?? "LavorAI <noreply@lavorai.it>";

const fmt = (d: Date, en: boolean) => d.toLocaleDateString(en ? "en-GB" : "it-IT", { weekday: "long", day: "numeric", month: "long" });
const first = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || null;

/** Welcome for new Free/paid signup. Historical trials are handled by runTrialNudges only. */
export async function sendPlanWelcomeEmail(u: { id: string; email: string; name: string | null; locale: string | null }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "no_key" };
  const en = u.locale === "en";
  const { html, text } = renderBrandEmail({ locale: u.locale,
    title: en ? "Choose your LavorAI plan" : "Scegli il tuo piano LavorAI",
    paragraphs: en ? ["Free includes 5 lifetime applications. A card is required, with no charge or automatic subscription. Pro is EUR 19.99/month; Pro+ is EUR 39.99/month, without a trial.", "LavorAI writes a tailored CV and cover letter for each position. Preview both before sending."]
      : ["Free include 5 candidature totali, senza scadenza. La carta è obbligatoria, senza addebiti né abbonamento automatico. Pro costa €19,99/mese; Pro+ €39,99/mese, senza prova.", "LavorAI scrive un CV e una lettera su misura per ogni posizione. Controlla entrambi prima di inviare."],
    cta: { label: en ? "Choose your plan" : "Scegli il piano", url: `${site()}/start-membership` },
  });
  return sendWithinQuota("welcome", u.email, async () => {
    const { error } = await new Resend(apiKey).emails.send({ from: from(), to: u.email,
      subject: en ? "Welcome to LavorAI" : "Benvenuto su LavorAI", html, text });
    if (error) throw new Error(JSON.stringify(error));
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
  const logs = await prisma.emailLog.findMany({ where: { kind: { in: ["trial_ending", "trial_ended", "trial_day_3", "trial_day_6"] } }, select: { kind: true, to: true } });
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
            ? [`On <strong>${fmt(u.trialEndsAt, en)}</strong> your existing Pro trial ends. Free remains available with 5 lifetime applications; Pro is an optional subscription.`, sent > 0 ? `So far LavorAI has sent <strong>${sent} ${sent === 1 ? "application" : "applications"}</strong> on your behalf. Keeping that running is €19.99 a month, cancel any time.` : "Keeping the engine running is €19.99 a month, cancel any time from Settings."]
            : [`Il <strong>${fmt(u.trialEndsAt, en)}</strong> la prova esistente termina. Free resta disponibile con 5 candidature totali; Pro è un abbonamento facoltativo.`, sent > 0 ? `Finora LavorAI ha inviato <strong>${sent} ${sent === 1 ? "candidatura" : "candidature"}</strong> a tuo nome. Continuare costa €19,99 al mese, disdici quando vuoi.` : "Continuare costa €19,99 al mese, disdici quando vuoi dalle Impostazioni."],
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
            ? ["Your existing trial has ended. Free includes 5 lifetime applications without automatic charges. Choose Pro for more applications.", sent > 0 ? `During the trial LavorAI sent <strong>${sent} ${sent === 1 ? "application" : "applications"}</strong> for you. Pro picks up exactly where it left off.` : "Pro picks up exactly where the trial left off: 50 applications a month, CV and cover letter tailored to each one."]
            : ["La tua prova esistente è terminata. Free include 5 candidature totali, senza addebiti automatici. Scegli Pro per continuare con più candidature.", sent > 0 ? `Durante la prova LavorAI ha inviato <strong>${sent} ${sent === 1 ? "candidatura" : "candidature"}</strong> per te. Con Pro riparte esattamente da dove si è fermato.` : "Con Pro riparte esattamente da dove si è fermato: 50 candidature al mese, CV e lettera su misura per ognuna."],
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
        const { error } = await new Resend(apiKey).emails.send({ from: from(), to: u.email, subject, html: email.html, text: email.text });
        if (error) throw new Error(JSON.stringify(error));
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
