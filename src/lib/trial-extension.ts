import type { PrismaClient } from "@prisma/client";
import { renderBrandEmail } from "@/lib/email-brand";
import { signOneClick } from "@/lib/one-click-token";
import { baseTrialEnd, isLifetimeProPlus, normalizeTier } from "@/lib/billing";

/**
 * One-off extra free week for users whose trial ended and who never paid.
 *
 * The week needs a card exactly like an active trial: the user is sent to
 * /start-membership (Stripe Checkout with trial_end = extension end; Stripe bills
 * the chosen plan at the end unless cancelled). The 5/day trial cap applies.
 *
 * Per user, in this order and only together:
 *   1. claim the UserNudge row kind "trial_extension" (sentCount 0 → 1),
 *   2. set User.trialExtensionEndsAt = now + 7 days (only if still null),
 *   3. send the email through sendWithinQuota.
 * If the email is not sent (quota, Resend error) both writes are rolled back,
 * so nobody gets a silent week that runs out before they hear about it, and the
 * user is picked up again on a later run. The week therefore starts when the
 * email goes out.
 *
 * Safety (see scripts/test-trial-extension.ts):
 *  - TRIAL_EXTENSION_ENABLED must be exactly "true"; otherwise (or with
 *    dryRun) a dry run: counts only, no DB writes, no email.
 *  - Never twice: trialExtensionEndsAt must be null and the ledger row unused.
 *  - Never paying/paid users, Stripe subscriptions, suspended, unverified,
 *    test/internal, admin or lifetime accounts; never users whose trial is
 *    still running. Opted-out or bounced users are skipped.
 *  - Per-run batch cap and a reserve of the shared daily email quota.
 *  - Held by USER_NOTIFICATIONS_HOLD like every scheduled user notification.
 *  - Consent is never recorded: the email only links to the app.
 */

export const TRIAL_EXTENSION_KIND = "trial_extension";
export const TRIAL_EXTENSION_EMAIL_KIND = "trial_extension" as const;
export const TRIAL_EXTENSION_DAYS = 7;
const DEFAULT_BATCH_CAP = 25;
const DEFAULT_QUOTA_RESERVE = 30;
const DAY_MS = 86_400_000;

type Env = Record<string, string | undefined>;

export function trialExtensionEnabled(env: Env = process.env): boolean {
  return env.TRIAL_EXTENSION_ENABLED?.trim().toLowerCase() === "true";
}

function intEnv(raw: string | undefined, fallback: number): number {
  const value = raw?.trim();
  if (!value || !/^\d+$/.test(value)) return fallback;
  return Number(value);
}

export interface ExtensionUser {
  id: string; email: string; name: string | null; locale: string | null;
  tier: string; createdAt: Date; trialEndsAt: Date | null; trialGraceEndsAt: Date | null; trialExtensionEndsAt: Date | null;
  stripeSubscriptionId: string | null; subscriptionStatus: string | null;
  emailVerified: Date | null; suspendedAt: Date | null; privacyConsentAt: Date | null;
  hasCv: boolean; autoApplyOn: boolean;
}

export interface ExtensionLedger { kind: string; sentCount: number; optedOutAt: Date | null; bouncedAt: Date | null }

export interface ExtensionCandidate {
  userId: string; email: string; name: string | null; locale: string;
  needsCard: boolean; needsConsent: boolean; needsCv: boolean; needsAutoApply: boolean; trialEndedAt: Date;
}

export type SkipReason = "not_eligible" | "already_extended" | "opted_out" | "bounced";

/** Pure: is this user eligible, and why not. */
export function extensionDecision(
  u: ExtensionUser, ledgers: ExtensionLedger[], now: Date,
  isTest: (email: string) => boolean, isAdmin: (email: string) => boolean,
): { ok: true; trialEndedAt: Date } | { ok: false; reason: SkipReason } {
  if (u.trialExtensionEndsAt || ledgers.some((l) => l.kind === TRIAL_EXTENSION_KIND && l.sentCount > 0)) return { ok: false, reason: "already_extended" };
  if (normalizeTier(u.tier) !== "free" || u.stripeSubscriptionId
    || ["active", "trialing", "past_due", "paused"].includes(u.subscriptionStatus ?? "")) return { ok: false, reason: "not_eligible" };
  if (!u.emailVerified || u.suspendedAt || isTest(u.email) || isAdmin(u.email) || isLifetimeProPlus(u.email)) return { ok: false, reason: "not_eligible" };
  const ended = baseTrialEnd(u);
  if (!ended || ended.getTime() > now.getTime()) return { ok: false, reason: "not_eligible" };
  if (ledgers.some((l) => l.bouncedAt)) return { ok: false, reason: "bounced" };
  if (ledgers.some((l) => l.kind === TRIAL_EXTENSION_KIND && l.optedOutAt)) return { ok: false, reason: "opted_out" };
  return { ok: true, trialEndedAt: ended };
}

/** Users who can start applying right away first, then the most recently expired. */
export function orderCandidates(c: ExtensionCandidate[]): ExtensionCandidate[] {
  const score = (x: ExtensionCandidate) => (x.needsCv ? 0 : 2) + (x.needsAutoApply ? 0 : 1) + (x.needsConsent ? 0 : 1);
  return [...c].sort((a, b) => score(b) - score(a) || b.trialEndedAt.getTime() - a.trialEndedAt.getTime());
}

// ---------- Email ----------

function siteUrl(env: Env): string {
  return (env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it").replace(/\/+$/, "");
}

export function trialExtensionOptOutUrl(userId: string, env: Env = process.env): string {
  return `${siteUrl(env)}/api/notifications/nudge-optout?k=${TRIAL_EXTENSION_KIND}&t=${encodeURIComponent(signOneClick(userId, `nudge-optout:${TRIAL_EXTENSION_KIND}`, 90))}`;
}

export function formatExtensionEnd(d: Date, en: boolean): string {
  return d.toLocaleDateString(en ? "en-GB" : "it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long" });
}

export function renderTrialExtensionEmail(c: ExtensionCandidate, endsAt: Date, env: Env = process.env): { subject: string; html: string; text: string; optOutUrl: string } {
  const en = c.locale === "en";
  const site = siteUrl(env);
  const optOutUrl = trialExtensionOptOutUrl(c.userId, env);
  const first = c.name?.trim().split(/\s+/)[0] || null;
  const greeting = en ? (first ? `Hi ${first},` : "Hi,") : (first ? `Ciao ${first},` : "Ciao,");
  const ends = formatExtensionEnd(endsAt, en);
  const optOutLabel = en ? "Stop emails like this" : "Non ricevere più email come questa";
  const optOutLink = `<a href="${optOutUrl}" style="color:#8A8C90;">${optOutLabel}</a>`;

  // Every eligible user has no active/trialing Stripe subscription, so the card
  // step always applies: the week opens only after Stripe Checkout (card, trial
  // until endsAt). At the end Stripe bills the chosen plan unless cancelled.
  const todo: string[] = [];
  if (c.needsCard) todo.push(en ? "<strong>Add a card through Stripe</strong> to unlock the week (nothing is charged during the 7 days)." : "<strong>Aggiungi una carta tramite Stripe</strong> per sbloccare la settimana (nessun addebito nei 7 giorni).");
  if (c.needsCv) todo.push(en ? "<strong>Upload your CV</strong> so applications can be tailored to you." : "<strong>Carica il CV</strong>, così le candidature vengono adattate a te.");
  if (c.needsAutoApply) todo.push(en ? "<strong>Turn on automatic applications</strong> and choose the roles you want." : "<strong>Attiva la candidatura automatica</strong> e scegli i ruoli che ti interessano.");
  if (c.needsConsent) todo.push(en ? "<strong>Confirm the privacy consent</strong> in the app: without it no application can be sent." : "<strong>Conferma il consenso privacy</strong> nell’app: senza, nessuna candidatura può partire.");

  const subject = en ? "You have another free week of LavorAI" : "Hai un’altra settimana gratis di LavorAI";
  const paragraphs = en
    ? [
        `Your free trial had ended, so we have reopened it for <strong>7 more days, until ${ends}</strong>.`,
        "As with every LavorAI trial, a card is required: add it through Stripe to use the week. Nothing is charged during the 7 days. When the week ends, the plan you chose renews automatically and is charged (Pro is €19.99/month) unless you cancel before then. Stripe shows the exact date and price before you confirm.",
        "Once it is active, LavorAI can look again for roles that match your profile and send applications for you (up to 5 a day).",
        todo.length ? "To get started:" : "Your profile is ready: applications can start on the next run.",
      ]
    : [
        `La tua prova gratuita era terminata: l’abbiamo riaperta per altri <strong>7 giorni, fino a ${ends}</strong>.`,
        "Come per ogni prova LavorAI, serve una carta: aggiungila tramite Stripe per usare la settimana. Nei 7 giorni non ti addebitiamo nulla. Alla fine della settimana il piano scelto si rinnova automaticamente con addebito (Pro costa €19,99/mese), salvo disdetta prima della scadenza. Stripe ti mostra data e prezzo esatti prima della conferma.",
        "Una volta attivata, LavorAI può tornare a cercare offerte in linea con il tuo profilo e inviare candidature per te (fino a 5 al giorno).",
        todo.length ? "Per iniziare:" : "Il tuo profilo è pronto: le candidature possono partire dal prossimo giro.",
      ];
  const footnote = en
    ? `If you don’t add a card, nothing happens and the week simply expires. You can cancel any time before the end of the week to avoid being charged. You are receiving this one-off email because your LavorAI trial had ended. ${optOutLink}.`
    : `Se non aggiungi una carta non succede nulla e la settimana scade da sola. Puoi disdire in qualsiasi momento prima della fine della settimana per non ricevere addebiti. Ricevi questa email una tantum perché la tua prova LavorAI era terminata. ${optOutLink}.`;
  const { html, text } = renderBrandEmail({
    locale: c.locale,
    eyebrow: en ? "Free trial extended" : "Prova gratuita estesa",
    preheader: en ? `7 more days, until ${ends}. Add a card to use them; nothing is charged during the week.` : `7 giorni in più, fino a ${ends}. Aggiungi una carta per usarli; nessun addebito durante la settimana.`,
    title: en ? "Another week of LavorAI, on us" : "Un’altra settimana di LavorAI, offerta da noi",
    greeting,
    paragraphs,
    bullets: todo.length ? todo : undefined,
    cta: { label: en ? "Activate your free week" : "Attiva la settimana gratuita", url: `${site}/start-membership` },
    footnote,
  });
  return { subject, html, text: text.replace(`${optOutLabel}.`, `${optOutLabel}: ${optOutUrl}`), optOutUrl };
}

// ---------- Runner ----------

type ExtDb = Pick<PrismaClient, "user" | "userNudge">;

export interface ExtensionSendResult { sent: boolean; reason?: string | null; providerEmailId?: string | null }

export interface ExtensionDeps {
  db: ExtDb;
  isTest: (email: string) => boolean;
  isAdmin: (email: string) => boolean;
  quota: () => Promise<{ today: number; daily: number }>;
  send: (c: ExtensionCandidate, message: ReturnType<typeof renderTrialExtensionEmail>, meta: { nudgeId: string }) => Promise<ExtensionSendResult>;
  heldGate: () => { held: boolean; reason?: string };
  log: (msg: string, data: Record<string, unknown>) => void;
}

export interface ExtensionRunResult {
  enabled: boolean;
  dryRun: boolean;
  held?: string;
  stoppedBy?: "batch_cap" | "quota_reserve";
  eligible: number;
  eligibleByLocale: { it: number; en: number };
  skipped: Record<SkipReason, number>;
  wouldSendThisRun: number;
  granted: number;
  sent: number;
  notSent: number;
  failed: number;
}

export async function findExtensionCandidates(db: ExtDb, deps: Pick<ExtensionDeps, "isTest" | "isAdmin">, now: Date) {
  const users = await db.user.findMany({
    where: { tier: "free", stripeSubscriptionId: null, trialExtensionEndsAt: null, suspendedAt: null, emailVerified: { not: null } },
    select: {
      id: true, email: true, name: true, locale: true, tier: true, createdAt: true, trialEndsAt: true, trialGraceEndsAt: true, trialExtensionEndsAt: true,
      stripeSubscriptionId: true, subscriptionStatus: true, emailVerified: true, suspendedAt: true, privacyConsentAt: true,
      preferences: { select: { autoApplyMode: true, rolesJson: true } },
      _count: { select: { cvDocuments: true } },
    },
  });
  const ledgers = users.length
    ? await db.userNudge.findMany({ where: { userId: { in: users.map((u) => u.id) } }, select: { userId: true, kind: true, sentCount: true, optedOutAt: true, bouncedAt: true } })
    : [];
  const byUser = new Map<string, ExtensionLedger[]>();
  for (const l of ledgers) byUser.set(l.userId, [...(byUser.get(l.userId) ?? []), l]);
  const skipped: Record<SkipReason, number> = { not_eligible: 0, already_extended: 0, opted_out: 0, bounced: 0 };
  const candidates: ExtensionCandidate[] = [];
  for (const row of users) {
    const autoApplyOn = !!row.preferences && ["auto", "hybrid"].includes(row.preferences.autoApplyMode) && row.preferences.rolesJson !== "[]";
    const u: ExtensionUser = { ...row, hasCv: row._count.cvDocuments > 0, autoApplyOn };
    const d = extensionDecision(u, byUser.get(u.id) ?? [], now, deps.isTest, deps.isAdmin);
    if (!d.ok) { skipped[d.reason]++; continue; }
    candidates.push({
      userId: u.id, email: u.email, name: u.name, locale: u.locale === "en" ? "en" : "it",
      needsCard: !["active", "trialing"].includes(u.subscriptionStatus ?? ""), needsConsent: !u.privacyConsentAt, needsCv: !u.hasCv, needsAutoApply: !autoApplyOn, trialEndedAt: d.trialEndedAt,
    });
  }
  return { candidates: orderCandidates(candidates), skipped };
}

export async function runTrialExtension(deps: ExtensionDeps, opts: { now?: Date; env?: Env; dryRun?: boolean; limit?: number } = {}): Promise<ExtensionRunResult> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? new Date();
  const enabled = trialExtensionEnabled(env);
  const dryRun = !enabled || !!opts.dryRun;
  const capEnv = intEnv(env.TRIAL_EXTENSION_BATCH_CAP, DEFAULT_BATCH_CAP);
  const cap = opts.limit != null && opts.limit >= 0 ? Math.min(opts.limit, capEnv) : capEnv;
  const reserve = intEnv(env.TRIAL_EXTENSION_QUOTA_RESERVE, DEFAULT_QUOTA_RESERVE);
  const result: ExtensionRunResult = {
    enabled, dryRun, eligible: 0, eligibleByLocale: { it: 0, en: 0 },
    skipped: { not_eligible: 0, already_extended: 0, opted_out: 0, bounced: 0 },
    wouldSendThisRun: 0, granted: 0, sent: 0, notSent: 0, failed: 0,
  };
  const gate = deps.heldGate();
  if (gate.held && !dryRun) { result.held = `user_notifications_${gate.reason ?? "held"}`; return result; }

  const { candidates, skipped } = await findExtensionCandidates(deps.db, deps, now);
  result.eligible = candidates.length;
  result.skipped = skipped;
  for (const c of candidates) result.eligibleByLocale[c.locale === "en" ? "en" : "it"]++;
  result.wouldSendThisRun = Math.min(cap, candidates.length);

  if (dryRun) {
    deps.log("[trial-extension] dry_run", { eligible: result.eligible, eligibleByLocale: result.eligibleByLocale, skipped, wouldSendThisRun: result.wouldSendThisRun });
    return result;
  }

  let attempted = 0;
  for (const c of candidates) {
    if (attempted >= cap) { result.stoppedBy = "batch_cap"; break; }
    const q = await deps.quota();
    if (q.today >= q.daily - reserve) { result.stoppedBy = "quota_reserve"; break; }
    attempted++;

    const row = await deps.db.userNudge.upsert({
      where: { userId_kind: { userId: c.userId, kind: TRIAL_EXTENSION_KIND } },
      create: { userId: c.userId, kind: TRIAL_EXTENSION_KIND },
      update: {},
      select: { id: true },
    });
    const claimed = await deps.db.userNudge.updateMany({
      where: { id: row.id, sentCount: 0, optedOutAt: null, bouncedAt: null },
      data: { sentCount: 1, lastSentAt: now },
    });
    if (claimed.count !== 1) { result.notSent++; continue; }
    const endsAt = new Date(now.getTime() + TRIAL_EXTENSION_DAYS * DAY_MS);
    const granted = await deps.db.user.updateMany({
      where: { id: c.userId, trialExtensionEndsAt: null, tier: "free", stripeSubscriptionId: null },
      data: { trialExtensionEndsAt: endsAt },
    });
    const releaseClaim = () => deps.db.userNudge.updateMany({ where: { id: row.id, lastSentAt: now }, data: { sentCount: 0, lastSentAt: null } });
    if (granted.count !== 1) { result.notSent++; await releaseClaim(); continue; }
    const rollback = async () => {
      await deps.db.user.updateMany({ where: { id: c.userId, trialExtensionEndsAt: endsAt }, data: { trialExtensionEndsAt: null } });
      await releaseClaim();
    };
    try {
      const sent = await deps.send(c, renderTrialExtensionEmail(c, endsAt, env), { nudgeId: row.id });
      if (sent.sent) {
        result.granted++;
        result.sent++;
        if (sent.providerEmailId) await deps.db.userNudge.update({ where: { id: row.id }, data: { lastProviderEmailId: sent.providerEmailId } });
      } else {
        result.notSent++;
        await rollback();
        if (sent.reason && /limit reached/.test(sent.reason)) { result.stoppedBy = "quota_reserve"; break; }
      }
    } catch {
      result.failed++;
      await rollback();
    }
  }
  deps.log("[trial-extension] run", { eligible: result.eligible, granted: result.granted, sent: result.sent, notSent: result.notSent, failed: result.failed, stoppedBy: result.stoppedBy ?? null });
  return result;
}

// ---------- Production wiring ----------

export async function defaultTrialExtensionDeps(): Promise<ExtensionDeps> {
  const [{ prisma }, admin, quota, guard, { Resend }] = await Promise.all([
    import("@/lib/db"), import("@/lib/admin"), import("@/lib/email-quota"), import("@/lib/user-notification-guard"), import("resend"),
  ]);
  const apiKey = process.env.RESEND_API_KEY;
  const resend = apiKey ? new Resend(apiKey) : null;
  return {
    db: prisma,
    isTest: admin.isTestAccount,
    isAdmin: admin.isAdmin,
    quota: async () => { const q = await quota.canSendEmail(); return { today: q.today, daily: q.daily }; },
    heldGate: () => { const g = guard.scheduledUserNotificationsHeld(); return g.held ? { held: true, reason: g.reason } : { held: false }; },
    log: (msg, data) => console.log(msg, JSON.stringify(data)),
    send: async (c, message, meta) => {
      if (!resend) return { sent: false, reason: "no_resend_key" };
      let providerEmailId: string | null = null;
      const r = await quota.sendWithinQuota(TRIAL_EXTENSION_EMAIL_KIND, c.email, async () => {
        const { data, error } = await resend.emails.send({
          from: process.env.EMAIL_FROM ?? "LavorAI <noreply@lavorai.it>",
          to: c.email,
          subject: message.subject,
          html: message.html,
          text: message.text,
          headers: { "List-Unsubscribe": `<${message.optOutUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          tags: [{ name: "user_nudge_id", value: meta.nudgeId }, { name: "category", value: TRIAL_EXTENSION_EMAIL_KIND }],
        });
        if (error) throw new Error(error.name ?? "resend_error");
        providerEmailId = data?.id ?? null;
      });
      return { sent: r.sent, reason: r.reason, providerEmailId };
    },
  };
}
