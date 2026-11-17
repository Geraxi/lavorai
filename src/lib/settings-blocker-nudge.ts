import type { PrismaClient } from "@prisma/client";
import { esc, renderBrandEmail } from "@/lib/email-brand";
import { signOneClick } from "@/lib/one-click-token";
import { hasPaidOrTrialApplicationAccess } from "@/lib/billing";

/**
 * Settings-blocker nudges for Pro / trial users whose OWN settings stop
 * LavorAI from sending applications. One blocker per user, in this order:
 *
 *  - onboarding_incomplete: onboarding not finished           → /onboarding
 *  - missing_cv:            no CV uploaded (consent mentioned) → /cv
 *  - auto_apply_off:        autoApplyMode "off"                → /preferences
 *  - narrow_preferences:    set up, but no application created in the last
 *                           NARROW_WINDOW_DAYS days → shows their own salary,
 *                           match threshold and cities, suggests widening
 *                                                              → /preferences
 *
 * Same channel and safety model as consent-questions-nudge:
 *  - SETTINGS_NUDGE_ENABLED must be exactly "true" for BOTH the dashboard banner
 *    and the email. Otherwise: no banner, cron runs as a dry run (counts only,
 *    no DB writes, no email).
 *  - USER_NOTIFICATIONS_HOLD / missing USER_NOTIFICATIONS_NOT_BEFORE hold the job.
 *  - Ledger in UserNudge (kind "settings_blocker"): at most 1 email every
 *    3 days, at most 3 ever; opt-out / bounce stop it. No email when the user
 *    received any other service nudge in the last 24h.
 *  - Per-run cap (SETTINGS_NUDGE_BATCH_CAP, default 20) and a reserve of the
 *    shared Resend daily quota for application emails
 *    (SETTINGS_NUDGE_QUOTA_RESERVE, default 40); every send goes through
 *    sendWithinQuota (RESEND_DAILY_LIMIT / RESEND_MONTHLY_LIMIT).
 *  - Links only open the app. Nothing is changed for the user: no consent,
 *    no preference, no auto-apply mode is ever set from the email or banner.
 *  - Never test/internal, suspended or unverified accounts; only users with
 *    paid or trial application access.
 */

export const SETTINGS_NUDGE_KIND = "settings_blocker" as const;
export const SETTINGS_NUDGE_EMAIL_KIND = "settings_blocker_nudge" as const;
export const SETTINGS_NUDGE_COOLDOWN_DAYS = 3;
export const SETTINGS_NUDGE_MAX = 3;
export const NARROW_WINDOW_DAYS = 7;
const DEFAULT_SALARY_MIN = 30;
const DEFAULT_MATCH_MIN = 50;
const DEFAULT_BATCH_CAP = 20;
const DEFAULT_QUOTA_RESERVE = 40;
const RECENT_OTHER_NUDGE_MS = 86_400_000;
const DAY_MS = 86_400_000;

export type SettingsBlocker = "onboarding_incomplete" | "missing_cv" | "auto_apply_off" | "narrow_preferences";

type Env = Record<string, string | undefined>;

export function settingsNudgeEnabled(env: Env = process.env): boolean {
  return env.SETTINGS_NUDGE_ENABLED?.trim().toLowerCase() === "true";
}

function intEnv(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw?.trim() && Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** Nearest larger job market for common provincial cities (suggestion only). */
const HUB: Record<string, string> = {
  brescia: "Milano", bergamo: "Milano", monza: "Milano", como: "Milano", varese: "Milano", lodi: "Milano",
  pavia: "Milano", cremona: "Milano", lecco: "Milano", novara: "Milano", piacenza: "Milano",
  asti: "Torino", cuneo: "Torino", alessandria: "Torino", biella: "Torino", vercelli: "Torino",
  latina: "Roma", frosinone: "Roma", viterbo: "Roma", rieti: "Roma",
  modena: "Bologna", ferrara: "Bologna", ravenna: "Bologna", imola: "Bologna", reggio: "Bologna",
  treviso: "Padova", vicenza: "Padova", rovigo: "Padova", venezia: "Padova", mestre: "Padova",
  prato: "Firenze", pistoia: "Firenze", arezzo: "Firenze", siena: "Firenze",
  caserta: "Napoli", salerno: "Napoli", avellino: "Napoli",
  pescara: "Roma", chieti: "Roma", "l'aquila": "Roma",
};

function parseList(raw: string | null | undefined): string[] {
  try {
    const v: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()) : [];
  } catch {
    return [];
  }
}

const isRemote = (c: string) => /\b(remote|remoto|da remoto|smart ?working|full ?remote)\b/i.test(c);

export interface NarrowDetails {
  salaryMin: number | null; // only when above the default
  matchMin: number | null; // only when above the default
  cities: string[];
  hasRemote: boolean;
  suggestedCities: string[];
}

export function narrowDetails(prefs: { salaryMin: number; matchMin: number; locationsJson: string }): NarrowDetails {
  const all = parseList(prefs.locationsJson);
  const cities = all.filter((c) => !isRemote(c));
  const lower = new Set(cities.map((c) => c.toLowerCase()));
  const suggested: string[] = [];
  for (const c of cities) {
    const hub = HUB[c.toLowerCase().split(/[\s,(]/)[0]];
    if (hub && !lower.has(hub.toLowerCase()) && !suggested.includes(hub)) suggested.push(hub);
  }
  return {
    salaryMin: prefs.salaryMin > DEFAULT_SALARY_MIN ? prefs.salaryMin : null,
    matchMin: prefs.matchMin > DEFAULT_MATCH_MIN ? prefs.matchMin : null,
    cities,
    hasRemote: all.some(isRemote),
    suggestedCities: suggested.slice(0, 2),
  };
}

export interface BlockerInput {
  onboardedAt: Date | null;
  hasCv: boolean;
  privacyConsentAt: Date | null;
  createdAt: Date;
  prefs: { autoApplyMode: string; salaryMin: number; matchMin: number; locationsJson: string } | null;
  recentApplications: number; // created in the last NARROW_WINDOW_DAYS days
}

export type BlockerResult =
  | { blocker: "onboarding_incomplete" | "auto_apply_off"; needsConsent: boolean }
  | { blocker: "missing_cv"; needsConsent: boolean }
  | { blocker: "narrow_preferences"; needsConsent: boolean; details: NarrowDetails };

/** Pure: the single most useful settings blocker, or null. */
export function detectSettingsBlocker(u: BlockerInput, now: Date): BlockerResult | null {
  const needsConsent = !u.privacyConsentAt;
  if (!u.onboardedAt) return { blocker: "onboarding_incomplete", needsConsent };
  if (!u.hasCv) return { blocker: "missing_cv", needsConsent };
  if (!u.prefs || u.prefs.autoApplyMode === "off") return { blocker: "auto_apply_off", needsConsent };
  // Missing consent alone is the consent nudge's job; do not double up.
  if (needsConsent) return null;
  if (u.recentApplications > 0) return null;
  if (now.getTime() - u.createdAt.getTime() < NARROW_WINDOW_DAYS * DAY_MS) return null;
  const details = narrowDetails(u.prefs);
  // Only nudge when there is a concrete setting to suggest changing.
  if (details.salaryMin == null && details.matchMin == null && details.hasRemote && details.suggestedCities.length === 0) return null;
  return { blocker: "narrow_preferences", needsConsent, details };
}

// ---------- Audience ----------

export interface SettingsCandidateUser {
  id: string; email: string; name: string | null; locale: string | null;
  emailVerified: Date | null; suspendedAt: Date | null; privacyConsentAt: Date | null;
  onboardedAt: Date | null; createdAt: Date;
  tier: string; subscriptionStatus: string | null; trialEndsAt: Date | null; trialGraceEndsAt: Date | null;
  trialExtensionEndsAt: Date | null; currentPeriodEnd: Date | null;
  preferences: { autoApplyMode: string; salaryMin: number; matchMin: number; locationsJson: string } | null;
  _count: { cvDocuments: number; applications: number };
}

export interface SettingsCandidate {
  userId: string; email: string; name: string | null; locale: string;
  result: BlockerResult;
}

export function selectSettingsCandidates(users: SettingsCandidateUser[], isTest: (email: string) => boolean, now: Date): SettingsCandidate[] {
  const out: SettingsCandidate[] = [];
  for (const u of users) {
    if (u.suspendedAt || !u.emailVerified || isTest(u.email)) continue;
    if (!hasPaidOrTrialApplicationAccess(u, now)) continue;
    const result = detectSettingsBlocker({
      onboardedAt: u.onboardedAt, hasCv: u._count.cvDocuments > 0, privacyConsentAt: u.privacyConsentAt,
      createdAt: u.createdAt, prefs: u.preferences, recentApplications: u._count.applications,
    }, now);
    if (result) out.push({ userId: u.id, email: u.email, name: u.name, locale: u.locale ?? "it", result });
  }
  return out;
}

const userSelect = (now: Date) => ({
  id: true, email: true, name: true, locale: true, emailVerified: true, suspendedAt: true, privacyConsentAt: true,
  onboardedAt: true, createdAt: true, tier: true, subscriptionStatus: true, trialEndsAt: true, trialGraceEndsAt: true,
  trialExtensionEndsAt: true, currentPeriodEnd: true,
  preferences: { select: { autoApplyMode: true, salaryMin: true, matchMin: true, locationsJson: true } },
  _count: { select: { cvDocuments: true, applications: { where: { createdAt: { gte: new Date(now.getTime() - NARROW_WINDOW_DAYS * DAY_MS) } } } } },
}) as const;

type SettingsDb = Pick<PrismaClient, "user" | "userNudge">;

export async function findSettingsCandidates(db: SettingsDb, isTest: (email: string) => boolean, now: Date): Promise<SettingsCandidate[]> {
  const users = await db.user.findMany({
    where: { suspendedAt: null, emailVerified: { not: null }, subscriptionStatus: { in: ["active", "trialing"] } },
    select: userSelect(now),
  });
  return selectSettingsCandidates(users as SettingsCandidateUser[], isTest, now);
}

/** Dashboard banner: the current user's blocker, only when the flag is on. Never throws. */
export async function getSettingsBlockerForUser(userId: string, env: Env = process.env, now = new Date()): Promise<BlockerResult | null> {
  if (!settingsNudgeEnabled(env)) return null;
  try {
    const [{ prisma }, { isTestAccount }] = await Promise.all([import("@/lib/db"), import("@/lib/admin")]);
    const u = await prisma.user.findUnique({ where: { id: userId }, select: userSelect(now) });
    if (!u) return null;
    return selectSettingsCandidates([u as SettingsCandidateUser], isTestAccount, now)[0]?.result ?? null;
  } catch {
    return null;
  }
}

// ---------- Copy (shared by banner and email) ----------

function siteUrl(env: Env): string {
  return (env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it").replace(/\/+$/, "");
}

export function settingsNudgeOptOutUrl(userId: string, env: Env = process.env): string {
  return `${siteUrl(env)}/api/notifications/nudge-optout?k=${SETTINGS_NUDGE_KIND}&t=${encodeURIComponent(signOneClick(userId, `nudge-optout:${SETTINGS_NUDGE_KIND}`, 90))}`;
}

export interface BlockerCopy { eyebrow: string; title: string; lines: string[]; cta: { label: string; href: string }; subject: string; preheader: string }

export function blockerCopy(r: BlockerResult, locale: string): BlockerCopy {
  const en = locale === "en";
  const consentLine = r.needsConsent
    ? (en
      ? "You will also need to read the privacy notice and give your consent in Settings: we never give it for you, and without it nothing is sent."
      : "Ti servirà anche leggere l’informativa privacy e dare il consenso da Impostazioni: non lo diamo mai al posto tuo e senza consenso non inviamo nulla.")
    : null;
  const withConsent = (lines: string[]) => (consentLine ? [...lines, consentLine] : lines);

  switch (r.blocker) {
    case "onboarding_incomplete":
      return {
        eyebrow: en ? "Setup incomplete" : "Configurazione incompleta",
        title: en ? "Finish setup so LavorAI can apply for you" : "Completa la configurazione per far partire le candidature",
        lines: withConsent([en
          ? "Your Pro plan is active, but setup is not finished yet: until you choose roles and cities, LavorAI cannot look for jobs or apply on your behalf."
          : "Il tuo piano Pro è attivo, ma la configurazione non è ancora completa: finché non scegli ruoli e città, LavorAI non può cercare offerte né candidarti."]),
        cta: { label: en ? "Finish setup" : "Completa la configurazione", href: "/onboarding" },
        subject: en ? "One step left before your first applications" : "Manca un passo alle tue prime candidature",
        preheader: en ? "It takes about two minutes." : "Bastano un paio di minuti.",
      };
    case "missing_cv":
      return {
        eyebrow: en ? "CV missing" : "CV mancante",
        title: en ? "Upload your CV to start applying" : "Carica il CV per iniziare a candidarti",
        lines: withConsent([en
          ? "Every application starts from your CV. Without it, LavorAI cannot send anything, even though your plan is active."
          : "Ogni candidatura parte dal tuo CV. Senza CV LavorAI non può inviare nulla, anche se il tuo piano è attivo."]),
        cta: { label: en ? "Upload CV" : "Carica il CV", href: "/cv" },
        subject: en ? "Your applications are waiting for your CV" : "Le tue candidature aspettano il tuo CV",
        preheader: en ? "Upload it once, we tailor it for every role." : "Lo carichi una volta, lo adattiamo per ogni offerta.",
      };
    case "auto_apply_off":
      return {
        eyebrow: en ? "Automatic applications off" : "Candidature automatiche disattivate",
        title: en ? "Automatic applications are switched off" : "Le candidature automatiche sono disattivate",
        lines: withConsent([en
          ? "Your account is ready, but automatic applications are set to “off”, so LavorAI is not sending any. You can turn them on in Preferences, choosing between fully automatic or confirming each one."
          : "Il tuo account è pronto, ma le candidature automatiche sono impostate su “off”, quindi LavorAI non ne invia nessuna. Puoi attivarle da Preferenze, scegliendo tra invio automatico o conferma una per una."]),
        cta: { label: en ? "Open Preferences" : "Apri Preferenze", href: "/preferences" },
        subject: en ? "Automatic applications are off on your account" : "Le candidature automatiche sono disattivate sul tuo account",
        preheader: en ? "Turn them on whenever you want." : "Puoi attivarle quando vuoi.",
      };
    case "narrow_preferences": {
      const d = r.details;
      const bits: string[] = [];
      if (d.salaryMin != null) bits.push(en ? `minimum salary €${d.salaryMin}k` : `RAL minima ${d.salaryMin}k €`);
      if (d.matchMin != null) bits.push(en ? `match threshold ${d.matchMin}%` : `soglia di compatibilità ${d.matchMin}%`);
      if (d.cities.length) bits.push(en ? `cities: ${d.cities.slice(0, 4).join(", ")}` : `città: ${d.cities.slice(0, 4).join(", ")}`);
      const tips: string[] = [];
      if (d.suggestedCities.length) tips.push(en ? `add ${d.suggestedCities.join(" or ")}` : `aggiungere ${d.suggestedCities.join(" o ")}`);
      if (!d.hasRemote) tips.push(en ? "include remote roles" : "includere il lavoro da remoto");
      if (d.salaryMin != null) tips.push(en ? "lower the minimum salary" : "abbassare la RAL minima");
      if (d.matchMin != null) tips.push(en ? "lower the match threshold" : "abbassare la soglia di compatibilità");
      return {
        eyebrow: en ? "No matching jobs" : "Nessuna offerta compatibile",
        title: en ? "Your filters are leaving out every job" : "I tuoi filtri stanno escludendo tutte le offerte",
        lines: [
          en
            ? `In the last ${NARROW_WINDOW_DAYS} days we found no job that matches all your current settings${bits.length ? ` (${bits.join("; ")})` : ""}, so no application was sent.`
            : `Negli ultimi ${NARROW_WINDOW_DAYS} giorni non abbiamo trovato offerte compatibili con tutte le tue impostazioni attuali${bits.length ? ` (${bits.join("; ")})` : ""}, quindi non è partita nessuna candidatura.`,
          ...(tips.length ? [en ? `To get more matches you could ${tips.join(", ")}. You decide: we change nothing for you.` : `Per avere più risultati potresti ${tips.join(", ")}. Decidi tu: non modifichiamo nulla al posto tuo.`] : []),
        ],
        cta: { label: en ? "Review preferences" : "Rivedi le preferenze", href: "/preferences" },
        subject: en ? "No applications this week: your filters may be too narrow" : "Nessuna candidatura questa settimana: i filtri potrebbero essere troppo stretti",
        preheader: en ? "A small change can unlock more jobs." : "Basta una piccola modifica per vedere più offerte.",
      };
    }
  }
}

function firstName(name: string | null): string | null {
  return name?.trim().split(/\s+/)[0] || null;
}

export function renderSettingsNudgeEmail(c: SettingsCandidate, env: Env = process.env): { subject: string; html: string; text: string; optOutUrl: string } {
  const en = c.locale === "en";
  const copy = blockerCopy(c.result, c.locale);
  const optOutUrl = settingsNudgeOptOutUrl(c.userId, env);
  const name = firstName(c.name);
  const label = en ? "Stop these reminders" : "Non ricevere più questi promemoria";
  const optOutLink = `<a href="${optOutUrl}" style="color:#8A8C90;">${label}</a>`;
  const footnote = en
    ? `You are receiving this service email because a setting on your LavorAI Pro account is stopping applications. We send at most ${SETTINGS_NUDGE_MAX}. ${optOutLink}.`
    : `Ricevi questa email di servizio perché un’impostazione del tuo account LavorAI Pro sta bloccando le candidature. Ne inviamo al massimo ${SETTINGS_NUDGE_MAX}. ${optOutLink}.`;
  const { html, text } = renderBrandEmail({
    locale: c.locale,
    preheader: copy.preheader,
    eyebrow: copy.eyebrow,
    title: copy.title,
    greeting: en ? (name ? `Hi ${name},` : "Hi,") : (name ? `Ciao ${name},` : "Ciao,"),
    paragraphs: copy.lines.map(esc),
    cta: { label: copy.cta.label, url: `${siteUrl(env)}${copy.cta.href}` },
    footnote,
  });
  return { subject: copy.subject, html, text: text.replace(`${label}.`, `${label}: ${optOutUrl}`), optOutUrl };
}

// ---------- Runner ----------

export interface SettingsNudgeDeps {
  db: SettingsDb;
  isTest: (email: string) => boolean;
  quota: () => Promise<{ today: number; daily: number }>;
  send: (c: SettingsCandidate, message: ReturnType<typeof renderSettingsNudgeEmail>, meta: { nudgeId: string }) => Promise<{ sent: boolean; reason?: string | null; providerEmailId?: string | null }>;
  heldGate: () => { held: boolean; reason?: string };
  log: (msg: string, data: Record<string, unknown>) => void;
}

export interface SettingsNudgeResult {
  enabled: boolean; dryRun: boolean; held?: string; ledgerMissing?: boolean;
  stoppedBy?: "batch_cap" | "quota_reserve";
  eligible: number; byBlocker: Record<SettingsBlocker, number>;
  throttled: number; recentOtherNudge: number; wouldSend: number; sent: number; skipped: number; failed: number;
}

function isMissingTable(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2021";
}

export async function runSettingsBlockerNudge(deps: SettingsNudgeDeps, opts: { now?: Date; env?: Env } = {}): Promise<SettingsNudgeResult> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? new Date();
  const enabled = settingsNudgeEnabled(env);
  const result: SettingsNudgeResult = {
    enabled, dryRun: !enabled, eligible: 0,
    byBlocker: { onboarding_incomplete: 0, missing_cv: 0, auto_apply_off: 0, narrow_preferences: 0 },
    throttled: 0, recentOtherNudge: 0, wouldSend: 0, sent: 0, skipped: 0, failed: 0,
  };
  const gate = deps.heldGate();
  if (gate.held && enabled) { result.held = `user_notifications_${gate.reason ?? "held"}`; return result; }

  const candidates = await findSettingsCandidates(deps.db, deps.isTest, now);
  result.eligible = candidates.length;
  for (const c of candidates) result.byBlocker[c.result.blocker]++;

  let ledgers: Array<{ userId: string; kind: string; sentCount: number; lastSentAt: Date | null; optedOutAt: Date | null; bouncedAt: Date | null }> = [];
  try {
    ledgers = candidates.length
      ? await deps.db.userNudge.findMany({ where: { userId: { in: candidates.map((c) => c.userId) } }, select: { userId: true, kind: true, sentCount: true, lastSentAt: true, optedOutAt: true, bouncedAt: true } })
      : [];
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    result.ledgerMissing = true;
    if (enabled) { result.held = "ledger_missing"; return result; }
  }

  const plan: SettingsCandidate[] = [];
  for (const c of candidates) {
    const mine = ledgers.filter((l) => l.userId === c.userId);
    const own = mine.find((l) => l.kind === SETTINGS_NUDGE_KIND);
    if (mine.some((l) => l.bouncedAt) || own?.optedOutAt || (own && own.sentCount >= SETTINGS_NUDGE_MAX)
      || (own?.lastSentAt && now.getTime() - own.lastSentAt.getTime() < SETTINGS_NUDGE_COOLDOWN_DAYS * DAY_MS)) { result.throttled++; continue; }
    if (mine.some((l) => l.kind !== SETTINGS_NUDGE_KIND && l.lastSentAt && now.getTime() - l.lastSentAt.getTime() < RECENT_OTHER_NUDGE_MS)) { result.recentOtherNudge++; continue; }
    plan.push(c);
    result.wouldSend++;
  }

  if (!enabled) {
    deps.log("[settings-blocker-nudge] dry_run", { eligible: result.eligible, byBlocker: result.byBlocker, wouldSend: result.wouldSend, throttled: result.throttled });
    return result;
  }

  const cap = intEnv(env.SETTINGS_NUDGE_BATCH_CAP, DEFAULT_BATCH_CAP);
  const reserve = intEnv(env.SETTINGS_NUDGE_QUOTA_RESERVE, DEFAULT_QUOTA_RESERVE);
  let attempted = 0;
  for (const c of plan) {
    if (attempted >= cap) { result.stoppedBy = "batch_cap"; break; }
    const q = await deps.quota();
    if (q.today >= q.daily - reserve) { result.stoppedBy = "quota_reserve"; break; }
    attempted++;
    const row = await deps.db.userNudge.upsert({
      where: { userId_kind: { userId: c.userId, kind: SETTINGS_NUDGE_KIND } },
      create: { userId: c.userId, kind: SETTINGS_NUDGE_KIND },
      update: {},
      select: { id: true, lastSentAt: true },
    });
    const claimed = await deps.db.userNudge.updateMany({
      where: {
        id: row.id, optedOutAt: null, bouncedAt: null, sentCount: { lt: SETTINGS_NUDGE_MAX },
        OR: [{ lastSentAt: null }, { lastSentAt: { lte: new Date(now.getTime() - SETTINGS_NUDGE_COOLDOWN_DAYS * DAY_MS) } }],
      },
      data: { sentCount: { increment: 1 }, lastSentAt: now },
    });
    if (claimed.count !== 1) { result.skipped++; continue; }
    const release = () => deps.db.userNudge.updateMany({ where: { id: row.id, lastSentAt: now }, data: { sentCount: { decrement: 1 }, lastSentAt: row.lastSentAt } });
    try {
      const sent = await deps.send(c, renderSettingsNudgeEmail(c, env), { nudgeId: row.id });
      if (sent.sent) {
        result.sent++;
        if (sent.providerEmailId) await deps.db.userNudge.update({ where: { id: row.id }, data: { lastProviderEmailId: sent.providerEmailId } });
      } else {
        result.skipped++;
        await release();
        if (sent.reason && /limit reached/.test(sent.reason)) { result.stoppedBy = "quota_reserve"; break; }
      }
    } catch {
      result.failed++;
      await release();
    }
  }
  deps.log("[settings-blocker-nudge] run", { eligible: result.eligible, byBlocker: result.byBlocker, sent: result.sent, skipped: result.skipped, failed: result.failed, stoppedBy: result.stoppedBy ?? null });
  return result;
}

/** Real dependencies (Prisma, Resend, quota, notification guard). Lazy so tests stay DB-free. */
export async function defaultSettingsNudgeDeps(): Promise<SettingsNudgeDeps> {
  const [{ prisma }, { isTestAccount }, quota, guard, { Resend }] = await Promise.all([
    import("@/lib/db"), import("@/lib/admin"), import("@/lib/email-quota"), import("@/lib/user-notification-guard"), import("resend"),
  ]);
  const apiKey = process.env.RESEND_API_KEY;
  const resend = apiKey ? new Resend(apiKey) : null;
  return {
    db: prisma,
    isTest: isTestAccount,
    quota: async () => { const q = await quota.canSendEmail(); return { today: q.today, daily: q.daily }; },
    heldGate: () => { const g = guard.scheduledUserNotificationsHeld(); return g.held ? { held: true, reason: g.reason } : { held: false }; },
    log: (msg, data) => console.log(msg, JSON.stringify(data)),
    send: async (c, message, meta) => {
      if (!resend) return { sent: false, reason: "no_resend_key" };
      let providerEmailId: string | null = null;
      const r = await quota.sendWithinQuota(SETTINGS_NUDGE_EMAIL_KIND, c.email, async () => {
        const { data, error } = await resend.emails.send({
          from: process.env.EMAIL_FROM ?? "LavorAI <noreply@lavorai.it>",
          to: c.email,
          subject: message.subject,
          html: message.html,
          text: message.text,
          headers: { "List-Unsubscribe": `<${message.optOutUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          tags: [{ name: "user_nudge_id", value: meta.nudgeId }, { name: "category", value: SETTINGS_NUDGE_EMAIL_KIND }],
        });
        if (error) throw new Error(error.name ?? "resend_error");
        providerEmailId = data?.id ?? null;
      });
      return { sent: r.sent, reason: r.reason, providerEmailId };
    },
  };
}
