import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { sendWithinQuota } from "@/lib/email-quota";
import { isTestAccount } from "@/lib/admin";

/**
 * Nudge di onboarding: email che ricordano agli utenti registrati ma "bloccati"
 * di completare gli step necessari (verifica → CV → preferenze → 1ª candidatura).
 *
 * Pensato per casi come Silvia: registrata, email verificata, ma ferma prima
 * di caricare il CV → il motore non ha nulla da inviare. Un nudge mirato la
 * riporta dentro al punto esatto dove si è fermata.
 *
 * Regole anti-spam:
 *  - mai agli account test/interni
 *  - max 1 nudge ogni NUDGE_COOLDOWN_DAYS per utente (dedup via EmailLog)
 *  - solo utenti registrati da almeno MIN_AGE_HOURS (non disturbiamo subito)
 *  - rispetta la quota email platform-wide (sendWithinQuota)
 */

const NUDGE_COOLDOWN_DAYS = 5;
const MIN_AGE_HOURS = 6;
const MAX_AGE_DAYS = 30; // oltre, l'utente è probabilmente perso: non insistere
const DEFAULT_BATCH_CAP = 50;

export type NudgeStep = "verify" | "cv" | "preferences" | "first_application";

export interface NudgeCandidate {
  userId: string;
  email: string;
  name: string | null;
  locale: string;
  step: NudgeStep;
  createdAt: Date;
}

/**
 * Determina lo step mancante per ogni utente non completamente onboardato.
 * Ritorna i candidati al nudge (già filtrati per età, test, cooldown).
 */
export async function findNudgeCandidates(opts?: {
  onlyEmail?: string;
  ignoreCooldown?: boolean;
}): Promise<NudgeCandidate[]> {
  const now = Date.now();
  const minAge = new Date(now - MIN_AGE_HOURS * 3600_000);
  const maxAge = new Date(now - MAX_AGE_DAYS * 86_400_000);

  const users = await prisma.user.findMany({
    where: opts?.onlyEmail
      ? { email: opts.onlyEmail }
      : { createdAt: { lte: minAge, gte: maxAge } },
    select: {
      id: true,
      email: true,
      name: true,
      locale: true,
      emailVerified: true,
      createdAt: true,
      onboardedAt: true,
      preferences: { select: { rolesJson: true } },
      _count: { select: { cvDocuments: true, applications: true } },
    },
  });

  const cooldownSince = new Date(now - NUDGE_COOLDOWN_DAYS * 86_400_000);
  const candidates: NudgeCandidate[] = [];

  for (const u of users) {
    if (isTestAccount(u.email)) continue;

    // Step mancante (priorità: verifica → CV → preferenze → 1ª candidatura).
    let step: NudgeStep | null = null;
    if (!u.emailVerified) step = "verify";
    else if (u._count.cvDocuments === 0) step = "cv";
    else if (!u.preferences || u.preferences.rolesJson === "[]")
      step = "preferences";
    else if (u._count.applications === 0) step = "first_application";

    if (!step) continue; // utente completo: niente nudge

    // Cooldown: niente nudge se ne ha ricevuto uno di recente.
    if (!opts?.ignoreCooldown) {
      const recent = await prisma.emailLog.count({
        where: {
          kind: "onboarding_nudge",
          to: u.email,
          createdAt: { gte: cooldownSince },
        },
      });
      if (recent > 0) continue;
    }

    candidates.push({
      userId: u.id,
      email: u.email,
      name: u.name,
      locale: u.locale ?? "it",
      step,
      createdAt: u.createdAt,
    });
  }

  return candidates;
}

export interface NudgeRunResult {
  sent: number;
  skipped: number;
  candidates: number;
  details: Array<{ email: string; step: NudgeStep; status: string }>;
}

/**
 * Invia i nudge. dryRun=true calcola i destinatari senza inviare nulla.
 */
export async function runOnboardingNudges(opts?: {
  dryRun?: boolean;
  onlyEmail?: string;
  ignoreCooldown?: boolean;
  cap?: number;
}): Promise<NudgeRunResult> {
  const candidates = await findNudgeCandidates({
    onlyEmail: opts?.onlyEmail,
    ignoreCooldown: opts?.ignoreCooldown,
  });
  const cap = opts?.cap ?? DEFAULT_BATCH_CAP;
  const batch = candidates.slice(0, cap);

  const details: NudgeRunResult["details"] = [];
  let sent = 0;
  let skipped = 0;

  if (opts?.dryRun) {
    for (const c of batch) {
      details.push({ email: c.email, step: c.step, status: "dry_run" });
    }
    return { sent: 0, skipped: 0, candidates: candidates.length, details };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      sent: 0,
      skipped: batch.length,
      candidates: candidates.length,
      details: batch.map((c) => ({
        email: c.email,
        step: c.step,
        status: "no_resend_key",
      })),
    };
  }
  const resend = new Resend(apiKey);

  for (const c of batch) {
    try {
      const result = await sendWithinQuota("onboarding_nudge", c.email, async () => {
        const { subject, html, text } = renderNudge(c);
        const { error } = await resend.emails.send({
          from: process.env.RESEND_FROM_OVERRIDE ?? "LavorAI <noreply@lavorai.it>",
          to: c.email,
          subject,
          html,
          text,
        });
        if (error) throw new Error(JSON.stringify(error));
      });
      if (result.sent) {
        sent++;
        details.push({ email: c.email, step: c.step, status: "sent" });
      } else {
        skipped++;
        details.push({
          email: c.email,
          step: c.step,
          status: result.reason ?? "skipped",
        });
      }
    } catch (err) {
      skipped++;
      details.push({
        email: c.email,
        step: c.step,
        status: "error: " + (err instanceof Error ? err.message.slice(0, 80) : "?"),
      });
    }
  }

  return { sent, skipped, candidates: candidates.length, details };
}

// ---------- Email content (IT + EN) ----------

const COPY = {
  it: {
    verify: {
      subject: "Conferma la tua email per attivare LavorAI",
      headline: "Ci sei quasi",
      lead: "Ti manca solo un passo: conferma la tua email per attivare il tuo account e iniziare a candidarti.",
      cta: "Conferma email",
      path: "/login",
    },
    cv: {
      subject: "Carica il tuo CV e lascia che LavorAI faccia il resto",
      headline: "Manca solo il tuo CV",
      lead: "Hai creato l'account ma non hai ancora caricato il CV. È il passo che sblocca tutto: ottimizzazione automatica e candidature su misura.",
      cta: "Carica il CV",
      path: "/onboarding/cv",
    },
    preferences: {
      subject: "Imposta le tue preferenze e inizia a ricevere candidature",
      headline: "Dicci cosa cerchi",
      lead: "Il tuo CV c'è. Ora imposta ruoli e località: bastano 2 minuti e LavorAI inizia a candidarti per i lavori giusti.",
      cta: "Imposta le preferenze",
      path: "/preferences",
    },
    first_application: {
      subject: "Tutto pronto: invia la tua prima candidatura",
      headline: "Sei pronto a partire",
      lead: "CV e preferenze ci sono. Fai partire la tua prima candidatura: LavorAI personalizza CV e lettera per ogni posizione.",
      cta: "Vai alle candidature",
      path: "/discover",
    },
    greet: (n: string | null) => (n ? `Ciao ${n},` : "Ciao,"),
    footer: "Ricevi questa email perché hai creato un account su LavorAI.",
  },
  en: {
    verify: {
      subject: "Confirm your email to activate LavorAI",
      headline: "You're almost there",
      lead: "Just one step left: confirm your email to activate your account and start applying.",
      cta: "Confirm email",
      path: "/login",
    },
    cv: {
      subject: "Upload your CV and let LavorAI do the rest",
      headline: "Your CV is the missing piece",
      lead: "You created your account but haven't uploaded a CV yet. That's the step that unlocks everything: automatic optimization and tailored applications.",
      cta: "Upload your CV",
      path: "/onboarding/cv",
    },
    preferences: {
      subject: "Set your preferences and start getting applications sent",
      headline: "Tell us what you're after",
      lead: "Your CV is in. Now set roles and locations — it takes 2 minutes and LavorAI starts applying to the right jobs for you.",
      cta: "Set preferences",
      path: "/preferences",
    },
    first_application: {
      subject: "All set: send your first application",
      headline: "You're ready to go",
      lead: "CV and preferences are in. Kick off your first application — LavorAI tailors your CV and cover letter for every role.",
      cta: "Go to applications",
      path: "/discover",
    },
    greet: (n: string | null) => (n ? `Hi ${n},` : "Hi,"),
    footer: "You're receiving this because you created a LavorAI account.",
  },
} as const;

export function renderNudge(c: NudgeCandidate): {
  subject: string;
  html: string;
  text: string;
} {
  const loc = c.locale === "en" ? "en" : "it";
  const m = COPY[loc];
  const s = m[c.step];
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";
  const url = `${siteUrl}${s.path}`;
  const greet = m.greet(c.name);

  const text =
    `${greet}\n\n${s.lead}\n\n${s.cta}: ${url}\n\n---\n${m.footer}\n© 2026 LavorAI`;

  const html = `<!doctype html><html lang="${loc}"><body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#0F172A;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-size:22px;font-weight:700;letter-spacing:-0.01em;margin-bottom:24px;">Lavor<span style="color:#16A34A;">AI</span></div>
    <h1 style="font-size:22px;font-weight:700;margin:0 0 10px;line-height:1.3;">${s.headline}</h1>
    <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 8px;">${greet}</p>
    <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 24px;">${s.lead}</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${url}" style="display:inline-block;background:#16A34A;color:#fff;text-decoration:none;padding:13px 26px;border-radius:8px;font-weight:600;font-size:15px;">${s.cta}</a>
    </div>
    <hr style="border:none;border-top:1px solid #E2E8F0;margin:28px 0 16px;" />
    <p style="font-size:12px;color:#94A3B8;line-height:1.6;margin:0;">${m.footer}<br/>© 2026 LavorAI</p>
  </div>
</body></html>`;

  return { subject: s.subject, html, text };
}
