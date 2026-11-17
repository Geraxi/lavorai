import type { Prisma, PrismaClient } from "@prisma/client";
import { esc, renderBrandEmail } from "@/lib/email-brand";
import { signOneClick } from "@/lib/one-click-token";

/**
 * Service nudges for applications that are blocked on the USER:
 *  - "privacy_consent": no privacy consent while auto-apply is set up or
 *    applications are already held for it. The email only links to the
 *    existing consent UI (/settings#privacy-consent, also rendered on
 *    /trial-expired). Consent is never recorded from the email or its link.
 *  - "pending_questions": applications in needs_answers. Links to /questions.
 *
 * Safety (all enforced here, see scripts/test-consent-questions-nudge.ts):
 *  - CONSENT_NUDGE_ENABLED must be exactly "true"; otherwise dry run (counts only,
 *    no DB writes, no email).
 *  - USER_NOTIFICATIONS_HOLD / missing USER_NOTIFICATIONS_NOT_BEFORE hold the job
 *    (same guard as every scheduled user notification).
 *  - Per user and kind: at most 1 email every 3 days, at most 3 ever, stored in
 *    UserNudge. Opted-out or bounced users are skipped. One nudge email per user
 *    per run (consent first: questions cannot be sent without it anyway).
 *  - Never test/internal accounts, suspended or unverified users (deleted users
 *    no longer exist: User rows are hard-deleted with cascade).
 *  - Per-run cap and a reserve of the shared daily email quota for application
 *    emails.
 */

export const NUDGE_KINDS = ["privacy_consent", "pending_questions"] as const;
export type NudgeKind = (typeof NUDGE_KINDS)[number];
export const NUDGE_COOLDOWN_DAYS = 3;
export const NUDGE_MAX_PER_KIND = 3;
export const PENDING_QUESTIONS_MAX_AGE_DAYS = 30;
const DEFAULT_BATCH_CAP = 40;
const DEFAULT_QUOTA_RESERVE = 40;
const DAY_MS = 86_400_000;

export const NUDGE_EMAIL_KIND: Record<NudgeKind, "privacy_consent_nudge" | "pending_questions_nudge"> = {
  privacy_consent: "privacy_consent_nudge",
  pending_questions: "pending_questions_nudge",
};

/** Same hold text the worker writes (heldMessage("privacy_consent_missing")); also used by /trial-expired. */
export const PRIVACY_HOLD_MARKER = "Consenso privacy mancante";

export function heldForConsentWhere(): Prisma.ApplicationWhereInput {
  return { status: { in: ["queued", "needs_user"] }, completedAt: null, errorMessage: { contains: PRIVACY_HOLD_MARKER } };
}

export function pendingQuestionsWhere(now: Date): Prisma.ApplicationWhereInput {
  return {
    status: "needs_answers", completedAt: null,
    createdAt: { gte: new Date(now.getTime() - PENDING_QUESTIONS_MAX_AGE_DAYS * DAY_MS) },
    job: { closedAt: null },
  };
}

type Env = Record<string, string | undefined>;

export function nudgeSendingEnabled(env: Env = process.env): boolean {
  return env.CONSENT_NUDGE_ENABLED?.trim().toLowerCase() === "true";
}

function intEnv(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export interface NudgeLedger {
  kind: string;
  sentCount: number;
  lastSentAt: Date | null;
  optedOutAt: Date | null;
  bouncedAt: Date | null;
}

export type ThrottleReason = "opted_out" | "bounced" | "max_total" | "cooldown";

/** Pure throttle decision for one user and kind. A bounce on ANY nudge kind blocks all kinds. */
export function nudgeThrottle(kind: NudgeKind, ledgers: NudgeLedger[], now: Date): { ok: true } | { ok: false; reason: ThrottleReason } {
  if (ledgers.some((l) => l.bouncedAt)) return { ok: false, reason: "bounced" };
  const row = ledgers.find((l) => l.kind === kind);
  if (!row) return { ok: true };
  if (row.optedOutAt) return { ok: false, reason: "opted_out" };
  if (row.sentCount >= NUDGE_MAX_PER_KIND) return { ok: false, reason: "max_total" };
  if (row.lastSentAt && now.getTime() - row.lastSentAt.getTime() < NUDGE_COOLDOWN_DAYS * DAY_MS) return { ok: false, reason: "cooldown" };
  return { ok: true };
}

export interface ConsentCandidate {
  kind: "privacy_consent";
  userId: string; email: string; name: string | null; locale: string;
  heldCount: number;
}
export interface QuestionsCandidate {
  kind: "pending_questions";
  userId: string; email: string; name: string | null; locale: string;
  pendingCount: number;
  companies: string[];
}
export type NudgeCandidate = ConsentCandidate | QuestionsCandidate;

export interface CandidateUser {
  id: string; email: string; name: string | null; locale: string | null;
  emailVerified: Date | null; suspendedAt: Date | null; privacyConsentAt: Date | null;
}

/**
 * Pure selection from already-fetched rows. Consent: the query admits users with
 * held rows or an auto-apply setup that would otherwise be held; this function
 * re-checks eligibility so a loose query can never widen the audience.
 */
export function selectConsentCandidates(
  users: Array<CandidateUser & { heldCount: number; autoApplyReady: boolean }>,
  isTest: (email: string) => boolean,
): ConsentCandidate[] {
  return users
    .filter((u) => !u.privacyConsentAt && !u.suspendedAt && !!u.emailVerified && !isTest(u.email))
    .filter((u) => u.heldCount > 0 || u.autoApplyReady)
    .map((u) => ({ kind: "privacy_consent" as const, userId: u.id, email: u.email, name: u.name, locale: u.locale ?? "it", heldCount: u.heldCount }))
    .sort((a, b) => b.heldCount - a.heldCount);
}

export function selectQuestionsCandidates(
  rows: Array<{ userId: string; company: string | null }>,
  users: Map<string, CandidateUser>,
  isTest: (email: string) => boolean,
): QuestionsCandidate[] {
  const byUser = new Map<string, { count: number; companies: string[] }>();
  for (const row of rows) {
    const entry = byUser.get(row.userId) ?? { count: 0, companies: [] };
    entry.count++;
    const company = row.company?.trim();
    if (company && !entry.companies.some((c) => c.toLowerCase() === company.toLowerCase())) entry.companies.push(company);
    byUser.set(row.userId, entry);
  }
  const out: QuestionsCandidate[] = [];
  for (const [userId, entry] of byUser) {
    const u = users.get(userId);
    if (!u || u.suspendedAt || !u.emailVerified || isTest(u.email)) continue;
    out.push({ kind: "pending_questions", userId, email: u.email, name: u.name, locale: u.locale ?? "it", pendingCount: entry.count, companies: entry.companies });
  }
  return out.sort((a, b) => b.pendingCount - a.pendingCount);
}

// ---------- Email content ----------

function siteUrl(env: Env): string {
  return (env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it").replace(/\/+$/, "");
}

export function nudgeOptOutUrl(userId: string, kind: NudgeKind, env: Env = process.env): string {
  return `${siteUrl(env)}/api/notifications/nudge-optout?k=${kind}&t=${encodeURIComponent(signOneClick(userId, `nudge-optout:${kind}`, 90))}`;
}

function firstName(name: string | null): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

export function renderNudgeEmail(c: NudgeCandidate, env: Env = process.env): { subject: string; html: string; text: string; optOutUrl: string } {
  const en = c.locale === "en";
  const site = siteUrl(env);
  const optOutUrl = nudgeOptOutUrl(c.userId, c.kind, env);
  const name = firstName(c.name);
  const greeting = en ? (name ? `Hi ${name},` : "Hi,") : (name ? `Ciao ${name},` : "Ciao,");
  const optOutLink = `<a href="${optOutUrl}" style="color:#8A8C90;">${en ? "Stop these reminders" : "Non ricevere più questi promemoria"}</a>`;

  if (c.kind === "privacy_consent") {
    const n = c.heldCount;
    const subject = en
      ? (n > 0 ? `${n} ${n === 1 ? "application is" : "applications are"} waiting for your privacy consent` : "Your automatic applications are waiting for your privacy consent")
      : (n > 0 ? `${n} ${n === 1 ? "candidatura è in attesa" : "candidature sono in attesa"} del tuo consenso privacy` : "Le tue candidature automatiche aspettano il consenso privacy");
    const lead = en
      ? (n > 0
        ? `<strong>${n} ${n === 1 ? "application is" : "applications are"} on hold</strong>: LavorAI cannot send ${n === 1 ? "it" : "them"} until you read the privacy notice and confirm your consent.`
        : "Automatic applications are on, but LavorAI cannot send any application until you read the privacy notice and confirm your consent.")
      : (n > 0
        ? `<strong>${n} ${n === 1 ? "candidatura è ferma" : "candidature sono ferme"}</strong>: LavorAI non può inviar${n === 1 ? "la" : "le"} finché non leggi l’informativa privacy e confermi il consenso.`
        : "La candidatura automatica è attiva, ma LavorAI non può inviare nessuna candidatura finché non leggi l’informativa privacy e confermi il consenso.");
    const how = en
      ? "Consent can only be given in the app: the button opens the page, it does not confirm anything for you. If you prefer not to consent, the applications stay on hold and nothing is sent."
      : "Il consenso si dà solo nell’app: il pulsante apre la pagina, non conferma nulla al posto tuo. Se preferisci non acconsentire, le candidature restano ferme e non viene inviato nulla.";
    const footnote = en
      ? `You are receiving this service email because the privacy consent needed to send applications is missing on your LavorAI account. We send at most ${NUDGE_MAX_PER_KIND}. ${optOutLink}.`
      : `Ricevi questa email di servizio perché sul tuo account LavorAI manca il consenso privacy necessario per inviare candidature. Ne inviamo al massimo ${NUDGE_MAX_PER_KIND}. ${optOutLink}.`;
    const { html, text } = renderBrandEmail({
      locale: c.locale,
      preheader: en ? "Your applications are on hold until you confirm." : "Le candidature restano in attesa finché non confermi.",
      eyebrow: en ? "Privacy consent" : "Consenso privacy",
      title: en ? "Your confirmation is needed to send applications" : "Serve la tua conferma per inviare le candidature",
      greeting,
      paragraphs: [lead, how],
      cta: { label: en ? "Review consent" : "Rivedi il consenso", url: `${site}/settings#privacy-consent` },
      footnote,
    });
    return { subject, html, text: withOptOutUrl(text, en, optOutUrl), optOutUrl };
  }

  const n = c.pendingCount;
  const shown = c.companies.slice(0, 5);
  const more = c.companies.length - shown.length;
  const subject = en
    ? `${n} ${n === 1 ? "application is" : "applications are"} waiting for your answers`
    : `${n} ${n === 1 ? "candidatura aspetta" : "candidature aspettano"} le tue risposte`;
  const lead = en
    ? `Some application forms ask for information we cannot take from your profile. Until you answer, ${n === 1 ? "this application stays" : `these ${n} applications stay`} on hold${shown.length ? ":" : "."}`
    : `Alcuni moduli di candidatura chiedono informazioni che non possiamo ricavare dal tuo profilo. Finché non rispondi, ${n === 1 ? "questa candidatura resta ferma" : `queste ${n} candidature restano ferme`}${shown.length ? ":" : "."}`;
  const bullets = shown.map((company) => `<strong>${esc(company)}</strong>`);
  if (more > 0) bullets.push(en ? `and ${more} more ${more === 1 ? "company" : "companies"}` : `e altre ${more} ${more === 1 ? "azienda" : "aziende"}`);
  const footnote = en
    ? `You are receiving this service email because you have applications on LavorAI that need your action. We send at most ${NUDGE_MAX_PER_KIND}. ${optOutLink}.`
    : `Ricevi questa email di servizio perché su LavorAI hai candidature che richiedono una tua azione. Ne inviamo al massimo ${NUDGE_MAX_PER_KIND}. ${optOutLink}.`;
  const { html, text } = renderBrandEmail({
    locale: c.locale,
    preheader: en ? "A few answers and they can go out." : "Bastano alcune risposte per sbloccarle.",
    eyebrow: en ? "Questions to answer" : "Domande in attesa",
    title: en ? "Your applications need a few answers" : "Le tue candidature aspettano qualche risposta",
    greeting,
    paragraphs: [lead],
    bullets,
    rawBlock: `<p style="font-size:15px;line-height:1.65;color:#3A3C40;margin:0 0 18px;">${en ? "Answer only what you want to share: nothing is made up on your behalf." : "Rispondi solo a ciò che vuoi condividere: nessuna risposta viene inventata al posto tuo."}</p>`,
    cta: { label: en ? "Answer the questions" : "Rispondi alle domande", url: `${site}/questions` },
    footnote,
  });
  const answerNote = en ? "Answer only what you want to share: nothing is made up on your behalf." : "Rispondi solo a ciò che vuoi condividere: nessuna risposta viene inventata al posto tuo.";
  const plain = text.replace(/\n\n?(Rispondi alle domande|Answer the questions): /, `\n${answerNote}\n\n$1: `);
  return { subject, html, text: withOptOutUrl(plain, en, optOutUrl), optOutUrl };
}

/** The brand text renderer strips links; keep the opt-out URL usable in plain text. */
function withOptOutUrl(text: string, en: boolean, url: string): string {
  const label = en ? "Stop these reminders" : "Non ricevere più questi promemoria";
  return text.replace(`${label}.`, `${label}: ${url}`);
}

// ---------- Runner ----------

type NudgeDb = Pick<PrismaClient, "user" | "application" | "userNudge">;

export interface NudgeSendResult { sent: boolean; reason?: string | null; providerEmailId?: string | null }

export interface NudgeDeps {
  db: NudgeDb;
  isTest: (email: string) => boolean;
  /** Platform-wide email quota (EmailLog): used to keep a reserve for application emails. */
  quota: () => Promise<{ today: number; daily: number }>;
  /** Sends through Resend inside sendWithinQuota (logs EmailLog on success). */
  send: (c: NudgeCandidate, message: ReturnType<typeof renderNudgeEmail>, meta: { nudgeId: string }) => Promise<NudgeSendResult>;
  heldGate: () => { held: boolean; reason?: string };
  applicationsPaused: () => boolean;
  log: (msg: string, data: Record<string, unknown>) => void;
}

type KindStats = { eligible: number; throttled: Record<ThrottleReason, number>; deferred: number; wouldSend: number; sent: number; skipped: number; failed: number };
export interface NudgeRunResult {
  enabled: boolean;
  dryRun: boolean;
  held?: string;
  ledgerMissing?: boolean;
  stoppedBy?: "batch_cap" | "quota_reserve";
  privacy_consent: KindStats;
  pending_questions: KindStats;
}

function emptyStats(): KindStats {
  return { eligible: 0, throttled: { opted_out: 0, bounced: 0, max_total: 0, cooldown: 0 }, deferred: 0, wouldSend: 0, sent: 0, skipped: 0, failed: 0 };
}

function isMissingTable(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2021";
}

const userSelect = { id: true, email: true, name: true, locale: true, emailVerified: true, suspendedAt: true, privacyConsentAt: true } as const;

export async function findNudgeCandidates(db: NudgeDb, isTest: (email: string) => boolean, now: Date) {
  const consentUsers = await db.user.findMany({
    where: {
      privacyConsentAt: null, suspendedAt: null, emailVerified: { not: null },
      OR: [
        { applications: { some: heldForConsentWhere() } },
        { preferences: { autoApplyMode: { in: ["auto", "hybrid"] }, NOT: { rolesJson: "[]" } }, cvDocuments: { some: {} } },
      ],
    },
    select: { ...userSelect, preferences: { select: { autoApplyMode: true, rolesJson: true } }, _count: { select: { applications: { where: heldForConsentWhere() }, cvDocuments: true } } },
  });
  const consent = selectConsentCandidates(consentUsers.map((u) => ({
    ...u,
    heldCount: u._count.applications,
    autoApplyReady: !!u.preferences && ["auto", "hybrid"].includes(u.preferences.autoApplyMode) && u.preferences.rolesJson !== "[]" && u._count.cvDocuments > 0,
  })), isTest);

  const waiting = await db.application.findMany({
    where: pendingQuestionsWhere(now),
    select: { userId: true, job: { select: { company: true } } },
    orderBy: { createdAt: "desc" },
  });
  const userIds = [...new Set(waiting.map((w) => w.userId))];
  const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: userSelect }) : [];
  const questions = selectQuestionsCandidates(
    waiting.map((w) => ({ userId: w.userId, company: w.job?.company ?? null })),
    new Map(users.map((u) => [u.id, u])),
    isTest,
  );
  return { consent, questions };
}

export function orderForSending(consent: ConsentCandidate[], questions: QuestionsCandidate[]): NudgeCandidate[] {
  const questionUsers = new Set(questions.map((q) => q.userId));
  const urgent = consent.filter((c) => c.heldCount > 0 || questionUsers.has(c.userId));
  const rest = consent.filter((c) => !(c.heldCount > 0 || questionUsers.has(c.userId)));
  return [...urgent, ...questions, ...rest];
}

export async function runConsentQuestionsNudge(deps: NudgeDeps, opts: { now?: Date; env?: Env } = {}): Promise<NudgeRunResult> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? new Date();
  const enabled = nudgeSendingEnabled(env);
  const result: NudgeRunResult = { enabled, dryRun: !enabled, privacy_consent: emptyStats(), pending_questions: emptyStats() };

  if (deps.applicationsPaused()) { result.held = "applications_paused"; return result; }
  const gate = deps.heldGate();
  if (gate.held && enabled) { result.held = `user_notifications_${gate.reason ?? "held"}`; return result; }

  const { consent, questions } = await findNudgeCandidates(deps.db, deps.isTest, now);
  result.privacy_consent.eligible = consent.length;
  result.pending_questions.eligible = questions.length;

  const userIds = [...new Set([...consent, ...questions].map((c) => c.userId))];
  let ledgers: Array<NudgeLedger & { userId: string }> = [];
  try {
    ledgers = userIds.length
      ? await deps.db.userNudge.findMany({ where: { userId: { in: userIds } }, select: { userId: true, kind: true, sentCount: true, lastSentAt: true, optedOutAt: true, bouncedAt: true } })
      : [];
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    result.ledgerMissing = true;
    // Without the ledger the throttle cannot be enforced: never send.
    if (enabled) { result.held = "ledger_missing"; return result; }
  }
  const byUser = new Map<string, NudgeLedger[]>();
  for (const l of ledgers) byUser.set(l.userId, [...(byUser.get(l.userId) ?? []), l]);

  // One nudge email per user per run; a user with both gets the consent email
  // first (answers cannot be sent without consent). Priority under the batch cap:
  // users with applications already blocked (held for consent, or waiting on
  // answers) before users who only have auto-apply set up.
  const plan: NudgeCandidate[] = [];
  const planned = new Set<string>();
  for (const c of orderForSending(consent, questions)) {
    const stats = result[c.kind];
    const decision = nudgeThrottle(c.kind, byUser.get(c.userId) ?? [], now);
    if (!decision.ok) { stats.throttled[decision.reason]++; continue; }
    if (planned.has(c.userId)) { stats.deferred++; continue; }
    planned.add(c.userId);
    plan.push(c);
    stats.wouldSend++;
  }

  if (!enabled) {
    deps.log("[consent-questions-nudge] dry_run", { privacy_consent: result.privacy_consent, pending_questions: result.pending_questions, ledgerMissing: !!result.ledgerMissing });
    return result;
  }

  const cap = intEnv(env.CONSENT_NUDGE_BATCH_CAP, DEFAULT_BATCH_CAP);
  const reserve = intEnv(env.CONSENT_NUDGE_QUOTA_RESERVE, DEFAULT_QUOTA_RESERVE);
  let attempted = 0;
  for (const c of plan) {
    const stats = result[c.kind];
    if (attempted >= cap) { result.stoppedBy = "batch_cap"; break; }
    const q = await deps.quota();
    if (q.today >= q.daily - reserve) { result.stoppedBy = "quota_reserve"; break; }
    attempted++;

    // Claim the slot atomically before sending, so concurrent runs cannot double-send.
    const row = await deps.db.userNudge.upsert({
      where: { userId_kind: { userId: c.userId, kind: c.kind } },
      create: { userId: c.userId, kind: c.kind },
      update: {},
      select: { id: true, lastSentAt: true },
    });
    const claimed = await deps.db.userNudge.updateMany({
      where: {
        id: row.id, optedOutAt: null, bouncedAt: null, sentCount: { lt: NUDGE_MAX_PER_KIND },
        OR: [{ lastSentAt: null }, { lastSentAt: { lte: new Date(now.getTime() - NUDGE_COOLDOWN_DAYS * DAY_MS) } }],
      },
      data: { sentCount: { increment: 1 }, lastSentAt: now },
    });
    if (claimed.count !== 1) { stats.skipped++; continue; }

    const release = () => deps.db.userNudge.updateMany({ where: { id: row.id, lastSentAt: now }, data: { sentCount: { decrement: 1 }, lastSentAt: row.lastSentAt } });
    try {
      const sent = await deps.send(c, renderNudgeEmail(c, env), { nudgeId: row.id });
      if (sent.sent) {
        stats.sent++;
        if (sent.providerEmailId) await deps.db.userNudge.update({ where: { id: row.id }, data: { lastProviderEmailId: sent.providerEmailId } });
      } else {
        stats.skipped++;
        await release();
        if (sent.reason && /limit reached/.test(sent.reason)) { result.stoppedBy = "quota_reserve"; break; }
      }
    } catch {
      stats.failed++;
      await release();
    }
  }
  deps.log("[consent-questions-nudge] run", { privacy_consent: result.privacy_consent, pending_questions: result.pending_questions, stoppedBy: result.stoppedBy ?? null });
  return result;
}

/** Resend outcome for a nudge email (webhook). Bounces/complaints stop all future nudges for that user. */
export async function recordNudgeEmailEvent(input: { nudgeId: string; type: string; occurredAt: Date }, client?: Pick<PrismaClient, "userNudge">): Promise<boolean> {
  if (!["email.bounced", "email.complained", "email.suppressed"].includes(input.type)) return true;
  const db = client ?? (await import("@/lib/db")).prisma;
  try {
    await db.userNudge.updateMany({ where: { id: input.nudgeId, bouncedAt: null }, data: { bouncedAt: input.occurredAt } });
  } catch (err) {
    if (!isMissingTable(err)) throw err;
  }
  return true;
}

// ---------- Production wiring ----------

/** Real dependencies (Prisma, Resend, quota, notification guard). Imported lazily so tests stay DB-free. */
export async function defaultNudgeDeps(): Promise<NudgeDeps> {
  const [{ prisma }, { isTestAccount }, quota, guard, pause, { Resend }] = await Promise.all([
    import("@/lib/db"), import("@/lib/admin"), import("@/lib/email-quota"),
    import("@/lib/user-notification-guard"), import("@/lib/application-pause"), import("resend"),
  ]);
  const apiKey = process.env.RESEND_API_KEY;
  const resend = apiKey ? new Resend(apiKey) : null;
  return {
    db: prisma,
    isTest: isTestAccount,
    quota: async () => { const q = await quota.canSendEmail(); return { today: q.today, daily: q.daily }; },
    heldGate: () => { const g = guard.scheduledUserNotificationsHeld(); return g.held ? { held: true, reason: g.reason } : { held: false }; },
    applicationsPaused: pause.applicationsPaused,
    log: (msg, data) => console.log(msg, JSON.stringify(data)),
    send: async (c, message, meta) => {
      if (!resend) return { sent: false, reason: "no_resend_key" };
      let providerEmailId: string | null = null;
      const r = await quota.sendWithinQuota(NUDGE_EMAIL_KIND[c.kind], c.email, async () => {
        const { data, error } = await resend.emails.send({
          from: process.env.EMAIL_FROM ?? "LavorAI <noreply@lavorai.it>",
          to: c.email,
          subject: message.subject,
          html: message.html,
          text: message.text,
          headers: { "List-Unsubscribe": `<${message.optOutUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          tags: [{ name: "user_nudge_id", value: meta.nudgeId }, { name: "category", value: NUDGE_EMAIL_KIND[c.kind] }],
        });
        if (error) throw new Error(error.name ?? "resend_error");
        providerEmailId = data?.id ?? null;
      });
      return { sent: r.sent, reason: r.reason, providerEmailId };
    },
  };
}
