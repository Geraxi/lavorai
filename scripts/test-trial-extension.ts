/** One-off trial extension: billing effect, eligibility, flag, idempotency, rollback, quota. No DB, no email. */
import assert from "node:assert/strict";
import {
  extensionDecision, orderCandidates, renderTrialExtensionEmail, runTrialExtension, TRIAL_EXTENSION_KIND,
  type ExtensionDeps, type ExtensionUser, type ExtensionCandidate,
} from "../src/lib/trial-extension";
import {
  trialEnd, trialState, isApplicationAccessPaused, requiresPaymentMethodBeforeApp, hasPaidOrTrialApplicationAccess,
  usesFreeWeeklyQuota, dailyApplicationLimit, effectiveTier, EARLY_USER_TRIAL_FINAL_END,
} from "../src/lib/billing";
import { isScheduledUserNotificationKind } from "../src/lib/user-notification-guard";
import { verifyOneClick } from "../src/lib/one-click-token";

const NOW = new Date();
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);
const isTest = (e: string) => e.endsWith("@test.lavorai");
const isAdmin = (e: string) => e === "boss@x.it";

// ---- billing: only the dedicated column extends, and without a card ----
{
  const expired = { email: "a@x.it", tier: "free", createdAt: ago(20), trialEndsAt: ago(13), trialGraceEndsAt: null, subscriptionStatus: null };
  assert.equal(trialState(expired).status, "ended");
  assert.equal(isApplicationAccessPaused(expired), true);
  const ext = { ...expired, trialExtensionEndsAt: new Date(NOW.getTime() + 7 * DAY) };
  assert.equal(trialState(ext).status, "active");
  assert.equal(trialEnd(ext)?.getTime(), ext.trialExtensionEndsAt.getTime());
  assert.equal(isApplicationAccessPaused(ext), false, "extended user can open the app");
  assert.equal(requiresPaymentMethodBeforeApp(ext), false, "no card wall during the extra week");
  assert.equal(hasPaidOrTrialApplicationAccess(ext), true, "trial access during the extra week");
  assert.equal(usesFreeWeeklyQuota(ext), false);
  assert.equal(dailyApplicationLimit(ext), 5, "trial cap of 5/day applies");
  assert.equal(effectiveTier(ext), "pro");
  const over = { ...expired, trialExtensionEndsAt: ago(1) };
  assert.equal(isApplicationAccessPaused(over), true, "access closes again when the week ends");
  assert.equal(hasPaidOrTrialApplicationAccess(over), false);
  // An extension date before the original end never shortens a running trial.
  const fresh = { ...expired, createdAt: ago(1), trialExtensionEndsAt: ago(30) };
  assert.equal(trialState(fresh).status, "active");
  assert.equal(requiresPaymentMethodBeforeApp(fresh), true, "a normal running trial still needs a card");
  // Early cohort keeps its fixed end; an extension after it wins.
  const legacy = { ...expired, createdAt: new Date("2026-09-01T12:00:00Z"), trialGraceEndsAt: new Date("2026-09-20T12:00:00Z") };
  assert.equal(trialEnd(legacy)?.toISOString(), EARLY_USER_TRIAL_FINAL_END);
  assert.equal(trialState({ ...legacy, trialExtensionEndsAt: new Date(NOW.getTime() + DAY) }).status, "active");
  // Paid tiers are untouched.
  assert.equal(isApplicationAccessPaused({ ...ext, tier: "pro" }), false);
}

// ---- eligibility (pure) ----
const u = (o: Partial<ExtensionUser> = {}): ExtensionUser => ({
  id: "u1", email: "mario@x.it", name: "Mario Rossi", locale: "it", tier: "free", createdAt: ago(20), trialEndsAt: ago(13),
  trialGraceEndsAt: null, trialExtensionEndsAt: null, stripeSubscriptionId: null, subscriptionStatus: null,
  emailVerified: ago(20), suspendedAt: null, privacyConsentAt: null, hasCv: true, autoApplyOn: true, ...o,
});
{
  const d = (x: ExtensionUser, l = [] as Parameters<typeof extensionDecision>[1]) => { const r = extensionDecision(x, l, NOW, isTest, isAdmin); return r.ok ? "ok" : r.reason; };
  assert.equal(d(u()), "ok");
  assert.equal(d(u({ createdAt: ago(3) })), "not_eligible", "trial still running");
  assert.equal(d(u({ tier: "pro" })), "not_eligible");
  assert.equal(d(u({ stripeSubscriptionId: "sub_1" })), "not_eligible");
  assert.equal(d(u({ subscriptionStatus: "past_due" })), "not_eligible");
  assert.equal(d(u({ emailVerified: null })), "not_eligible");
  assert.equal(d(u({ suspendedAt: ago(1) })), "not_eligible");
  assert.equal(d(u({ email: "x@test.lavorai" })), "not_eligible");
  assert.equal(d(u({ email: "boss@x.it" })), "not_eligible");
  assert.equal(d(u({ email: "antonella.lasalandra07@gmail.com" })), "not_eligible", "lifetime");
  assert.equal(d(u({ trialExtensionEndsAt: ago(1) })), "already_extended");
  assert.equal(d(u(), [{ kind: TRIAL_EXTENSION_KIND, sentCount: 1, optedOutAt: null, bouncedAt: null }]), "already_extended");
  assert.equal(d(u(), [{ kind: TRIAL_EXTENSION_KIND, sentCount: 0, optedOutAt: ago(1), bouncedAt: null }]), "opted_out");
  assert.equal(d(u(), [{ kind: "privacy_consent", sentCount: 1, optedOutAt: null, bouncedAt: ago(1) }]), "bounced");
  assert.equal(d(u(), [{ kind: "privacy_consent", sentCount: 1, optedOutAt: ago(1), bouncedAt: null }]), "ok", "other kinds' opt-out does not block");
}

// ---- ordering ----
{
  const c = (userId: string, o: Partial<ExtensionCandidate>): ExtensionCandidate => ({ userId, email: `${userId}@x.it`, name: null, locale: "it", needsConsent: true, needsCv: true, needsAutoApply: true, trialEndedAt: ago(10), ...o });
  assert.deepEqual(orderCandidates([c("bare", {}), c("ready", { needsConsent: false, needsCv: false, needsAutoApply: false }), c("cv", { needsCv: false }), c("bareRecent", { trialEndedAt: ago(1) })]).map((x) => x.userId),
    ["ready", "cv", "bareRecent", "bare"]);
}

// ---- email ----
{
  const env = { NEXT_PUBLIC_SITE_URL: "https://lavorai.it" };
  const c: ExtensionCandidate = { userId: "u1", email: "m@x.it", name: "Mario Rossi", locale: "it", needsConsent: true, needsCv: false, needsAutoApply: false, trialEndedAt: ago(10) };
  const ends = new Date("2026-11-25T11:30:00Z");
  const it = renderTrialExtensionEmail(c, ends, env);
  assert.equal(it.subject, "Hai un’altra settimana gratis di LavorAI");
  assert.match(it.html, /mercoledì 25 novembre/);
  assert.match(it.html, /https:\/\/lavorai\.it\/dashboard/);
  assert.match(it.html, /Conferma il consenso privacy/);
  assert.doesNotMatch(it.html, /Carica il CV/);
  assert.match(it.text, /Non ricevere più email come questa: https:\/\/lavorai\.it\/api\/notifications\/nudge-optout\?k=trial_extension/);
  const t = new URL(it.optOutUrl).searchParams.get("t")!;
  assert.deepEqual(verifyOneClick(t, `nudge-optout:${TRIAL_EXTENSION_KIND}`), { userId: "u1" });
  const en = renderTrialExtensionEmail({ ...c, locale: "en", needsConsent: false }, ends, env);
  assert.equal(en.subject, "You have another free week of LavorAI");
  assert.match(en.html, /Wednesday 25 November/);
  assert.match(en.html, /Your profile is ready/);
  assert.ok(isScheduledUserNotificationKind("trial_extension"));
}

// ---- runner with a fake DB ----
function fakeDeps(users: ExtensionUser[], o: { sendOk?: (email: string) => boolean | "throw"; quotaToday?: number; held?: boolean } = {}) {
  const nudges: Array<{ id: string; userId: string; kind: string; sentCount: number; lastSentAt: Date | null; optedOutAt: Date | null; bouncedAt: Date | null; lastProviderEmailId?: string | null }> = [];
  const rows = users.map((x) => ({ ...x, preferences: { autoApplyMode: x.autoApplyOn ? "auto" : "off", rolesJson: x.autoApplyOn ? '["dev"]' : "[]" }, _count: { cvDocuments: x.hasCv ? 1 : 0 } }));
  const sent: string[] = [];
  let today = o.quotaToday ?? 0;
  const match = (r: Record<string, unknown>, w: Record<string, unknown>) => Object.entries(w).every(([k, v]) => v instanceof Date ? (r[k] as Date)?.getTime() === v.getTime() : (r[k] ?? null) === v);
  const db = {
    user: {
      findMany: async () => rows.filter((r) => r.tier === "free" && !r.stripeSubscriptionId && !r.trialExtensionEndsAt && !r.suspendedAt && r.emailVerified),
      updateMany: async ({ where, data }: any) => { const hit = rows.filter((r) => match(r as any, where)); hit.forEach((r) => Object.assign(r, data)); return { count: hit.length }; },
    },
    userNudge: {
      findMany: async ({ where }: any) => nudges.filter((n) => where.userId.in.includes(n.userId)),
      upsert: async ({ where, create }: any) => {
        let n = nudges.find((x) => x.userId === where.userId_kind.userId && x.kind === where.userId_kind.kind);
        if (!n) { n = { id: `n${nudges.length}`, sentCount: 0, lastSentAt: null, optedOutAt: null, bouncedAt: null, ...create }; nudges.push(n!); }
        return n;
      },
      updateMany: async ({ where, data }: any) => { const hit = nudges.filter((n) => match(n as any, where)); hit.forEach((n) => Object.assign(n, data)); return { count: hit.length }; },
      update: async ({ where, data }: any) => Object.assign(nudges.find((n) => n.id === where.id)!, data),
    },
  };
  const deps: ExtensionDeps = {
    db: db as any, isTest, isAdmin,
    quota: async () => ({ today, daily: 95 }),
    heldGate: () => (o.held ? { held: true, reason: "hold" } : { held: false }),
    log: () => {},
    send: async (c) => {
      const ok = o.sendOk ? o.sendOk(c.email) : true;
      if (ok === "throw") throw new Error("resend");
      if (!ok) return { sent: false, reason: "daily limit reached (95/95)" };
      today++; sent.push(c.email); return { sent: true, providerEmailId: `re_${c.userId}` };
    },
  };
  return { deps, rows, nudges, sent };
}

async function main() {
  const people = [u({ id: "a", email: "a@x.it" }), u({ id: "b", email: "b@x.it", locale: "en" }), u({ id: "c", email: "c@x.it", createdAt: ago(2) }), u({ id: "d", email: "d@x.it", tier: "pro" })];
  // Flag off → dry run, no writes, no email.
  {
    const f = fakeDeps(people);
    const r = await runTrialExtension(f.deps, { env: {}, now: NOW });
    assert.equal(r.dryRun, true); assert.equal(r.eligible, 2); assert.deepEqual(r.eligibleByLocale, { it: 1, en: 1 });
    assert.equal(f.sent.length, 0); assert.equal(f.nudges.length, 0); assert.ok(f.rows.every((x) => !x.trialExtensionEndsAt));
  }
  // dryRun param overrides the flag.
  {
    const f = fakeDeps(people);
    const r = await runTrialExtension(f.deps, { env: { TRIAL_EXTENSION_ENABLED: "true" }, now: NOW, dryRun: true });
    assert.equal(r.dryRun, true); assert.equal(f.sent.length, 0);
  }
  // Enabled: grant + email together; second run does nothing (idempotent).
  {
    const f = fakeDeps(people);
    const env = { TRIAL_EXTENSION_ENABLED: "true" };
    const r = await runTrialExtension(f.deps, { env, now: NOW });
    assert.equal(r.sent, 2); assert.equal(r.granted, 2);
    assert.deepEqual(f.sent.sort(), ["a@x.it", "b@x.it"]);
    const a = f.rows.find((x) => x.id === "a")!;
    assert.equal(a.trialExtensionEndsAt?.getTime(), NOW.getTime() + 7 * DAY);
    assert.equal(f.rows.find((x) => x.id === "c")!.trialExtensionEndsAt, null, "running trial untouched");
    assert.equal(f.rows.find((x) => x.id === "d")!.trialExtensionEndsAt, null, "paid untouched");
    const r2 = await runTrialExtension(f.deps, { env, now: new Date(NOW.getTime() + DAY) });
    assert.equal(r2.eligible, 0); assert.equal(f.sent.length, 2, "never twice");
    // Even if the extension column were cleared, the ledger blocks a second grant.
    a.trialExtensionEndsAt = null;
    const r3 = await runTrialExtension(f.deps, { env, now: new Date(NOW.getTime() + 2 * DAY) });
    assert.equal(r3.eligible, 0); assert.equal(r3.skipped.already_extended, 1);
  }
  // Batch cap and ?limit.
  {
    const many = Array.from({ length: 5 }, (_, i) => u({ id: `m${i}`, email: `m${i}@x.it` }));
    const f = fakeDeps(many);
    const r = await runTrialExtension(f.deps, { env: { TRIAL_EXTENSION_ENABLED: "true", TRIAL_EXTENSION_BATCH_CAP: "3" }, now: NOW, limit: 2 });
    assert.equal(r.sent, 2); assert.equal(r.stoppedBy, "batch_cap");
    const r2 = await runTrialExtension(f.deps, { env: { TRIAL_EXTENSION_ENABLED: "true", TRIAL_EXTENSION_BATCH_CAP: "3" }, now: NOW, limit: 50 });
    assert.equal(r2.sent, 3, "limit never raises the env cap");
  }
  // Quota reserve: stop before sending.
  {
    const f = fakeDeps(people, { quotaToday: 65 });
    const r = await runTrialExtension(f.deps, { env: { TRIAL_EXTENSION_ENABLED: "true" }, now: NOW });
    assert.equal(r.sent, 0); assert.equal(r.stoppedBy, "quota_reserve"); assert.ok(f.rows.every((x) => !x.trialExtensionEndsAt));
  }
  // Email not sent or failed → grant and claim rolled back, user retried later.
  {
    const f = fakeDeps(people, { sendOk: (e) => (e === "a@x.it" ? "throw" : false) });
    const r = await runTrialExtension(f.deps, { env: { TRIAL_EXTENSION_ENABLED: "true" }, now: NOW });
    assert.equal(r.sent, 0); assert.equal(r.failed + r.notSent, 2);
    assert.ok(f.rows.every((x) => !x.trialExtensionEndsAt), "no silent week");
    assert.ok(f.nudges.every((n) => n.sentCount === 0 && n.lastSentAt === null));
    const r2 = await runTrialExtension(fakeDeps(people).deps, { env: { TRIAL_EXTENSION_ENABLED: "true" }, now: NOW });
    assert.equal(r2.sent, 2);
  }
  // Notification hold blocks sending but not the dry run.
  {
    const f = fakeDeps(people, { held: true });
    const r = await runTrialExtension(f.deps, { env: { TRIAL_EXTENSION_ENABLED: "true" }, now: NOW });
    assert.equal(r.held, "user_notifications_hold"); assert.equal(f.sent.length, 0);
    const d = await runTrialExtension(f.deps, { env: {}, now: NOW });
    assert.equal(d.eligible, 2);
  }
  console.log("trial-extension: ok");
}
main().catch((e) => { console.error(e); process.exit(1); });
