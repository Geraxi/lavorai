import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { sendWithinQuota } from "@/lib/email-quota";
import { isTestAccount } from "@/lib/admin";

/**
 * Upgrade nudge: email che spinge utenti FREE attivi al Pro.
 *
 * Target: utenti che (a) sono su tier="free", (b) hanno fatto almeno 1
 * candidatura (= hanno provato il prodotto), (c) iscritti da almeno 5 giorni
 * (hanno avuto tempo di vedere il valore), (d) non hanno ricevuto un nudge
 * upgrade negli ultimi 10 giorni.
 *
 * Filosofia (coerente col resto): valore concreto + numeri suoi reali, niente
 * pressioni FOMO finte. Pricing onesto, motivo concreto per upgrade.
 */

const COOLDOWN_DAYS = 10;
const MIN_AGE_DAYS = 5;
const MAX_AGE_DAYS = 90;
const DEFAULT_CAP = 100;

export interface UpgradeCandidate {
  userId: string;
  email: string;
  name: string | null;
  locale: string;
  applicationsCount: number;
  daysSinceSignup: number;
  /**
   * "generic"   → utente Free attivo, nudge di valore periodico
   * "limit_hit" → ha esaurito il tetto mensile del piano Free ORA:
   *               questo è il momento massimo di conversione — pipeline
   *               ferma, incentivo massimo a sbloccare Pro subito.
   */
  reason: "generic" | "limit_hit";
}

/**
 * Tetto mensile del piano Free — deve restare allineato a getLimits(free)
 * in lib/billing.ts. Duplicato qui per evitare ciclo di dipendenza sulle
 * env di stripe che billing.ts richiede.
 */
const FREE_MONTHLY_CAP = 3;

export async function findUpgradeCandidates(opts?: {
  onlyEmail?: string;
  ignoreCooldown?: boolean;
}): Promise<UpgradeCandidate[]> {
  const now = Date.now();
  const minAge = new Date(now - MIN_AGE_DAYS * 86_400_000);
  const maxAge = new Date(now - MAX_AGE_DAYS * 86_400_000);

  // Pool 1: free "attivi" nella finestra 5-90 giorni (nudge di valore periodico).
  // Pool 2: free CHE HANNO ESAURITO IL LIMITE MENSILE — indipendentemente
  // dall'età dell'account. Sono il segmento più conversion-heavy: pipeline
  // ferma, dolore massimo. Include anche vecchi utenti (>90gg) che l'ex
  // filtro MAX_AGE_DAYS scartava.
  const users = await prisma.user.findMany({
    where: opts?.onlyEmail
      ? { email: opts.onlyEmail }
      : {
          tier: "free",
          createdAt: { lte: minAge }, // rimosso il floor 90gg: limit-hit vince
        },
    select: {
      id: true,
      email: true,
      name: true,
      locale: true,
      tier: true,
      createdAt: true,
      _count: { select: { applications: true } },
    },
  });

  // Conteggio candidature del mese corrente per identificare i limit-hit.
  // Un'unica group-by su tutti i free users evita N+1 sulla DB.
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthByUser = await prisma.application.groupBy({
    by: ["userId"],
    where: {
      userId: { in: users.map((u) => u.id) },
      createdAt: { gte: monthStart },
      status: { in: ["success", "queued", "optimizing", "applying", "ready_to_apply"] },
    },
    _count: { _all: true },
  });
  const monthlyUsed = new Map(monthByUser.map((r) => [r.userId, r._count._all]));

  const cooldownSince = new Date(now - COOLDOWN_DAYS * 86_400_000);
  const out: UpgradeCandidate[] = [];

  for (const u of users) {
    if (u.tier !== "free") continue;
    if (isTestAccount(u.email)) continue;
    if (u._count.applications < 1) continue; // mai usato → nudge onboarding, non upgrade

    const usedThisMonth = monthlyUsed.get(u.id) ?? 0;
    const limitHit = usedThisMonth >= FREE_MONTHLY_CAP;
    const withinValueWindow = u.createdAt.getTime() >= maxAge.getTime();

    // Segmentazione: limit-hit sempre; altrimenti solo se ancora nella
    // finestra di valore (5-90 gg). Vecchi utenti Free che NON hanno
    // esaurito il limite non vengono (ri)disturbati.
    if (!limitHit && !withinValueWindow) continue;

    if (!opts?.ignoreCooldown) {
      const recent = await prisma.emailLog.count({
        where: {
          kind: "upgrade_nudge",
          to: u.email,
          createdAt: { gte: cooldownSince },
        },
      });
      if (recent > 0) continue;
    }

    out.push({
      userId: u.id,
      email: u.email,
      name: u.name,
      locale: u.locale ?? "it",
      applicationsCount: u._count.applications,
      daysSinceSignup: Math.round((now - u.createdAt.getTime()) / 86_400_000),
      reason: limitHit ? "limit_hit" : "generic",
    });
  }

  // Priorità: prima i limit-hit (conversione massima), poi i generic.
  out.sort((a, b) => {
    if (a.reason === b.reason) return 0;
    return a.reason === "limit_hit" ? -1 : 1;
  });

  return out;
}

export interface UpgradeRunResult {
  sent: number;
  skipped: number;
  candidates: number;
  details: Array<{ email: string; applications: number; status: string }>;
}

export async function runUpgradeNudges(opts?: {
  dryRun?: boolean;
  onlyEmail?: string;
  ignoreCooldown?: boolean;
  cap?: number;
}): Promise<UpgradeRunResult> {
  const candidates = await findUpgradeCandidates({
    onlyEmail: opts?.onlyEmail,
    ignoreCooldown: opts?.ignoreCooldown,
  });
  const cap = opts?.cap ?? DEFAULT_CAP;
  const batch = candidates.slice(0, cap);

  const details: UpgradeRunResult["details"] = [];
  let sent = 0;
  let skipped = 0;

  if (opts?.dryRun) {
    for (const c of batch) details.push({ email: c.email, applications: c.applicationsCount, status: "dry_run" });
    return { sent: 0, skipped: 0, candidates: candidates.length, details };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      sent: 0,
      skipped: batch.length,
      candidates: candidates.length,
      details: batch.map((c) => ({ email: c.email, applications: c.applicationsCount, status: "no_resend_key" })),
    };
  }
  const resend = new Resend(apiKey);

  for (const c of batch) {
    try {
      const result = await sendWithinQuota("upgrade_nudge", c.email, async () => {
        const { subject, html, text } = renderUpgrade(c);
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
        details.push({ email: c.email, applications: c.applicationsCount, status: "sent" });
      } else {
        skipped++;
        details.push({ email: c.email, applications: c.applicationsCount, status: result.reason ?? "skipped" });
      }
    } catch (err) {
      skipped++;
      details.push({
        email: c.email,
        applications: c.applicationsCount,
        status: "error: " + (err instanceof Error ? err.message.slice(0, 80) : "?"),
      });
    }
  }

  return { sent, skipped, candidates: candidates.length, details };
}

// ---------- Email content ----------

function renderUpgrade(c: UpgradeCandidate): { subject: string; html: string; text: string } {
  const loc = c.locale === "en" ? "en" : "it";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";
  const url = `${siteUrl}/pricing`;
  const greetName = c.name && c.name.trim() ? c.name.split(/\s+/)[0] : null;

  const isLimitHit = c.reason === "limit_hit";
  const COPY = {
    it: {
      subject: isLimitHit
        ? `Hai finito le ${FREE_MONTHLY_CAP} candidature del mese — sblocca ora`
        : "Sblocca l'auto-apply 24/7 — passa a Pro",
      greet: greetName ? `Ciao ${greetName},` : "Ciao,",
      lead: isLimitHit
        ? `Hai raggiunto il tetto Free di ${FREE_MONTHLY_CAP} candidature/mese. Il motore ha trovato nuovi annunci compatibili col tuo profilo ma non puo' candidarti finche' il piano non riparte a inizio mese.`
        : c.applicationsCount > 1
          ? `Hai gia' inviato ${c.applicationsCount} candidature con LavorAI Free. Bene.`
          : `Hai gia' provato LavorAI Free. Bene.`,
      pitch: isLimitHit
        ? "Con Pro riparti oggi stesso:"
        : "Su Pro la differenza e' concreta:",
      bullets: [
        "Auto-apply 24/7 senza limite giornaliero",
        "Generazione CV + lettera personalizzata per OGNI annuncio (Free: limitato)",
        "Tracking risposte recruiter via email inbound (parsate, classificate)",
        "Match minimo regolabile + round multipli paralleli",
        "Supporto prioritario",
      ],
      promise:
        "Promessa: prima consegna confermata entro 24h dall'upgrade, o rimborso integrale.",
      cta: isLimitHit ? "Sblocca ora" : "Passa a Pro",
      footer:
        "Ricevi questa email perche' hai un account LavorAI Free attivo. Cambia tier o disiscriviti in qualsiasi momento.",
    },
    en: {
      subject: isLimitHit
        ? `You hit your ${FREE_MONTHLY_CAP}-application monthly cap — unlock now`
        : "Unlock 24/7 auto-apply — upgrade to Pro",
      greet: greetName ? `Hi ${greetName},` : "Hi,",
      lead: isLimitHit
        ? `You've hit the Free tier cap of ${FREE_MONTHLY_CAP} applications this month. The engine found new matches for you but can't submit them until the plan resets on the 1st.`
        : c.applicationsCount > 1
          ? `You've already submitted ${c.applicationsCount} applications on LavorAI Free. Nice.`
          : `You've tried LavorAI Free. Nice.`,
      pitch: isLimitHit
        ? "With Pro you resume today:"
        : "Pro is where the real value kicks in:",
      bullets: [
        "24/7 auto-apply with no daily cap",
        "Tailored CV + cover letter for EVERY job (Free is limited)",
        "Recruiter reply tracking via inbound email parsing",
        "Adjustable match threshold + parallel rounds",
        "Priority support",
      ],
      promise:
        "Promise: first confirmed delivery within 24h after upgrade, or full refund.",
      cta: isLimitHit ? "Unlock now" : "Upgrade to Pro",
      footer:
        "You're receiving this because you have an active LavorAI Free account. Change tier or unsubscribe anytime.",
    },
  } as const;
  const m = COPY[loc];

  const bulletsHtml = m.bullets.map((b) => `<li style="margin:6px 0;">${b}</li>`).join("");
  const bulletsText = m.bullets.map((b) => `• ${b}`).join("\n");

  const text =
    `${m.greet}\n\n${m.lead}\n\n${m.pitch}\n${bulletsText}\n\n${m.promise}\n\n${m.cta}: ${url}\n\n---\n${m.footer}\n© 2026 LavorAI`;

  const html = `<!doctype html><html lang="${loc}"><body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#0F172A;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-size:22px;font-weight:700;letter-spacing:-0.01em;margin-bottom:24px;">Lavor<span style="color:#16A34A;">AI</span></div>
    <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 8px;">${m.greet}</p>
    <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 16px;">${m.lead}</p>
    <p style="font-size:15px;line-height:1.6;color:#0F172A;margin:0 0 8px;font-weight:600;">${m.pitch}</p>
    <ul style="margin:0 0 18px;padding-left:20px;font-size:14.5px;line-height:1.65;color:#334155;">${bulletsHtml}</ul>
    <div style="padding:14px 16px;border-left:3px solid #16A34A;background:#ECFDF5;border-radius:6px;font-size:13.5px;line-height:1.55;color:#065F46;margin-bottom:24px;">
      ${m.promise}
    </div>
    <div style="text-align:center;margin:28px 0;">
      <a href="${url}" style="display:inline-block;background:#16A34A;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">${m.cta}</a>
    </div>
    <hr style="border:none;border-top:1px solid #E2E8F0;margin:28px 0 16px;" />
    <p style="font-size:11.5px;color:#94A3B8;line-height:1.6;margin:0;">${m.footer}<br/>© 2026 LavorAI</p>
  </div>
</body></html>`;

  return { subject: m.subject, html, text };
}
