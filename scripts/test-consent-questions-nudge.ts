/** Consent / pending-questions nudges: selection, throttle, flag, holds. No DB, no email. */
import assert from "node:assert/strict";
import {
  NUDGE_COOLDOWN_DAYS, NUDGE_MAX_PER_KIND, nudgeThrottle, renderNudgeEmail, runConsentQuestionsNudge,
  selectConsentCandidates, selectQuestionsCandidates, recordNudgeEmailEvent, orderForSending, type NudgeDeps, type NudgeCandidate,
} from "../src/lib/consent-questions-nudge";
import { isScheduledUserNotificationKind } from "../src/lib/user-notification-guard";
import { verifyOneClick } from "../src/lib/one-click-token";

const NOW = new Date("2026-11-18T08:30:00.000Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const isTest = (email: string) => email.endsWith("@test.lavorai");
const base = { name: "Mario Rossi", locale: "it", emailVerified: ago(10), suspendedAt: null, privacyConsentAt: null };

// ---- throttle (pure) ----
{
  assert.deepEqual(nudgeThrottle("privacy_consent", [], NOW), { ok: true });
  const row = (o: object) => ({ kind: "privacy_consent", sentCount: 1, lastSentAt: ago(1), optedOutAt: null, bouncedAt: null, ...o });
  assert.deepEqual(nudgeThrottle("privacy_consent", [row({})], NOW), { ok: false, reason: "cooldown" });
  assert.deepEqual(nudgeThrottle("privacy_consent", [row({ lastSentAt: ago(NUDGE_COOLDOWN_DAYS - 0.01) })], NOW), { ok: false, reason: "cooldown" });
  assert.deepEqual(nudgeThrottle("privacy_consent", [row({ lastSentAt: ago(NUDGE_COOLDOWN_DAYS) })], NOW), { ok: true }, "exactly 3 days later is allowed");
  assert.deepEqual(nudgeThrottle("privacy_consent", [row({ sentCount: NUDGE_MAX_PER_KIND, lastSentAt: ago(30) })], NOW), { ok: false, reason: "max_total" });
  assert.deepEqual(nudgeThrottle("privacy_consent", [row({ optedOutAt: ago(2), lastSentAt: ago(30) })], NOW), { ok: false, reason: "opted_out" });
  // The other kind's cooldown/opt-out does not block this kind; a bounce on any kind does.
  assert.deepEqual(nudgeThrottle("pending_questions", [row({ optedOutAt: ago(2) })], NOW), { ok: true });
  assert.deepEqual(nudgeThrottle("pending_questions", [row({ bouncedAt: ago(5), lastSentAt: ago(30) })], NOW), { ok: false, reason: "bounced" });
}

// ---- selection (pure) ----
{
  const users = [
    { ...base, id: "held", email: "held@x.it", heldCount: 2, autoApplyReady: false },
    { ...base, id: "ready", email: "ready@x.it", heldCount: 0, autoApplyReady: true },
    { ...base, id: "idle", email: "idle@x.it", heldCount: 0, autoApplyReady: false },
    { ...base, id: "consented", email: "c@x.it", heldCount: 3, autoApplyReady: true, privacyConsentAt: ago(1) },
    { ...base, id: "suspended", email: "s@x.it", heldCount: 3, autoApplyReady: true, suspendedAt: ago(1) },
    { ...base, id: "unverified", email: "u@x.it", heldCount: 3, autoApplyReady: true, emailVerified: null },
    { ...base, id: "test", email: "t@test.lavorai", heldCount: 3, autoApplyReady: true },
  ];
  const consent = selectConsentCandidates(users, isTest);
  assert.deepEqual(consent.map((c) => c.userId), ["held", "ready"], "only auto-apply-ready or held users; held first");

  const map = new Map(users.map((u) => [u.id, u]));
  const questions = selectQuestionsCandidates([
    { userId: "held", company: "Stripe" }, { userId: "held", company: "stripe" }, { userId: "held", company: "Optics11" },
    { userId: "ready", company: null }, { userId: "suspended", company: "X" }, { userId: "test", company: "Y" }, { userId: "gone", company: "Z" },
  ], map, isTest);
  assert.deepEqual(questions.map((q) => [q.userId, q.pendingCount, q.companies]), [["held", 3, ["Stripe", "Optics11"]], ["ready", 1, []]],
    "counts per user, de-duplicated companies, skips suspended/test/deleted users; consent is not required to answer");
}

// ---- send order under the batch cap ----
{
  const c = (userId: string, heldCount: number) => ({ kind: "privacy_consent" as const, userId, email: `${userId}@x.it`, name: null, locale: "it", heldCount });
  const q = (userId: string) => ({ kind: "pending_questions" as const, userId, email: `${userId}@x.it`, name: null, locale: "it", pendingCount: 1, companies: [] });
  assert.deepEqual(orderForSending([c("held", 2), c("both", 0), c("setup-only", 0)], [q("both"), q("answers")]).map((x) => `${x.kind}:${x.userId}`),
    ["privacy_consent:held", "privacy_consent:both", "pending_questions:both", "pending_questions:answers", "privacy_consent:setup-only"],
    "blocked applications first; setup-only consent nudges last");
}

// ---- email content ----
{
  process.env.AUTH_SECRET = "test-secret-not-real";
  const consentMail = renderNudgeEmail({ kind: "privacy_consent", userId: "u1", email: "a@x.it", name: "Mario Rossi", locale: "it", heldCount: 2 }, { NEXT_PUBLIC_SITE_URL: "https://lavorai.it" });
  assert.equal(consentMail.subject, "2 candidature sono in attesa del tuo consenso privacy");
  assert.match(consentMail.html, /href="https:\/\/lavorai\.it\/settings#privacy-consent"/);
  assert.match(consentMail.text, /non conferma nulla al posto tuo/);
  assert.doesNotMatch(consentMail.html, /\/api\/account\/privacy-consent/, "never links to the consent-recording API");
  const token = new URL(consentMail.optOutUrl).searchParams.get("t") ?? "";
  assert.deepEqual(verifyOneClick(token, "nudge-optout:privacy_consent"), { userId: "u1" });
  assert.equal(verifyOneClick(token, "nudge-optout:pending_questions"), null, "opt-out token is scoped to one kind");
  assert.match(consentMail.html, /Ciao Mario,/);

  const qMail = renderNudgeEmail({ kind: "pending_questions", userId: "u1", email: "a@x.it", name: null, locale: "it", pendingCount: 7,
    companies: ["Stripe", "A&B <Srl>", "C", "D", "E", "F", "G"] }, {});
  assert.equal(qMail.subject, "7 candidature aspettano le tue risposte");
  assert.match(qMail.html, /A&amp;B &lt;Srl&gt;/, "company names are escaped");
  assert.match(qMail.html, /e altre 2 aziende/);
  assert.match(qMail.html, /\/questions"/);
  const en = renderNudgeEmail({ kind: "pending_questions", userId: "u1", email: "a@x.it", name: null, locale: "en", pendingCount: 1, companies: ["Stripe"] }, {});
  assert.equal(en.subject, "1 application is waiting for your answers");
  assert.ok(isScheduledUserNotificationKind("privacy_consent_nudge") && isScheduledUserNotificationKind("pending_questions_nudge"),
    "nudge kinds go through USER_NOTIFICATIONS_HOLD / cutoff in sendWithinQuota");
}

// ---- runner with an in-memory DB ----
type Ledger = { id: string; userId: string; kind: string; sentCount: number; lastSentAt: Date | null; optedOutAt: Date | null; bouncedAt: Date | null; lastProviderEmailId: string | null };
function fakeWorld(opts: { ledgers?: Partial<Ledger>[]; missingTable?: boolean } = {}) {
  const users = [
    { ...base, id: "u-held", email: "held@x.it", preferences: { autoApplyMode: "auto", rolesJson: "[\"pm\"]" }, held: 2, cvs: 1 },
    { ...base, id: "u-both", email: "both@x.it", preferences: { autoApplyMode: "auto", rolesJson: "[\"pm\"]" }, held: 0, cvs: 1 },
    { ...base, id: "u-q", email: "q@x.it", privacyConsentAt: ago(20), preferences: null, held: 0, cvs: 1 },
    { ...base, id: "u-off", email: "off@x.it", preferences: { autoApplyMode: "off", rolesJson: "[\"pm\"]" }, held: 0, cvs: 1 },
  ];
  const apps = [
    { userId: "u-both", company: "Stripe" }, { userId: "u-q", company: "Optics11" }, { userId: "u-q", company: "Doctolib" },
  ];
  let seq = 0;
  const ledgers: Ledger[] = (opts.ledgers ?? []).map((l) => ({ id: `n${++seq}`, userId: "", kind: "", sentCount: 0, lastSentAt: null, optedOutAt: null, bouncedAt: null, lastProviderEmailId: null, ...l }));
  const writes: string[] = [];
  const missing = () => { if (opts.missingTable) throw Object.assign(new Error("missing"), { code: "P2021" }); };
  const matchClaim = (l: Ledger, where: any) => l.id === where.id && !l.optedOutAt && !l.bouncedAt && l.sentCount < where.sentCount.lt
    && (!l.lastSentAt || l.lastSentAt.getTime() <= where.OR[1].lastSentAt.lte.getTime());
  const db: any = {
    user: {
      findMany: async ({ where }: any) => {
        if (where.id?.in) return users.filter((u) => where.id.in.includes(u.id));
        // consent query: the fake mirrors its OR (held rows, or auto/hybrid + roles + CV)
        return users.filter((u) => !u.privacyConsentAt && !u.suspendedAt && u.emailVerified
          && (u.held > 0 || (u.preferences && ["auto", "hybrid"].includes(u.preferences.autoApplyMode) && u.preferences.rolesJson !== "[]" && u.cvs > 0)))
          .map((u) => ({ ...u, _count: { applications: u.held, cvDocuments: u.cvs } }));
      },
    },
    application: { findMany: async () => apps.map((a) => ({ userId: a.userId, job: { company: a.company } })) },
    userNudge: {
      findMany: async ({ where }: any) => { missing(); return ledgers.filter((l) => where.userId.in.includes(l.userId)); },
      upsert: async ({ where, create }: any) => {
        missing(); writes.push("upsert");
        let row = ledgers.find((l) => l.userId === where.userId_kind.userId && l.kind === where.userId_kind.kind);
        if (!row) { row = { id: `n${++seq}`, sentCount: 0, lastSentAt: null, optedOutAt: null, bouncedAt: null, lastProviderEmailId: null, ...create } as Ledger; ledgers.push(row); }
        return { id: row.id, lastSentAt: row.lastSentAt };
      },
      updateMany: async ({ where, data }: any) => {
        writes.push("updateMany");
        if (where.sentCount) {
          const rows = ledgers.filter((l) => matchClaim(l, where));
          for (const l of rows) { l.sentCount += data.sentCount.increment; l.lastSentAt = data.lastSentAt; }
          return { count: rows.length };
        }
        if ("bouncedAt" in where) {
          const rows = ledgers.filter((l) => l.id === where.id && !l.bouncedAt);
          for (const l of rows) l.bouncedAt = data.bouncedAt;
          return { count: rows.length };
        }
        const rows = ledgers.filter((l) => l.id === where.id && l.lastSentAt?.getTime() === where.lastSentAt.getTime());
        for (const l of rows) { l.sentCount -= data.sentCount.decrement; l.lastSentAt = data.lastSentAt; }
        return { count: rows.length };
      },
      update: async ({ where, data }: any) => { writes.push("update"); Object.assign(ledgers.find((l) => l.id === where.id)!, data); },
    },
  };
  const sent: Array<{ kind: string; email: string; subject: string; nudgeId: string }> = [];
  let quotaToday = 0;
  const deps = (o: Partial<NudgeDeps> & { failFor?: string } = {}): NudgeDeps => ({
    db, isTest,
    quota: async () => ({ today: quotaToday, daily: 95 }),
    heldGate: () => ({ held: false }),
    applicationsPaused: () => false,
    log: () => {},
    send: async (c: NudgeCandidate, m, meta) => {
      if (o.failFor === c.userId) throw new Error("resend down");
      sent.push({ kind: c.kind, email: c.email, subject: m.subject, nudgeId: meta.nudgeId });
      quotaToday++;
      return { sent: true, providerEmailId: `re_${sent.length}` };
    },
    ...o,
  });
  return { db, ledgers, writes, sent, deps, setQuota: (n: number) => { quotaToday = n; } };
}

async function main() {
  // Flag OFF (default): dry run counts only, no writes, no email.
  {
    const w = fakeWorld();
    const r = await runConsentQuestionsNudge(w.deps(), { now: NOW, env: {} });
    assert.equal(r.dryRun, true);
    assert.equal(r.privacy_consent.eligible, 2);
    assert.equal(r.privacy_consent.wouldSend, 2);
    assert.equal(r.pending_questions.eligible, 2);
    assert.equal(r.pending_questions.wouldSend, 1, "u-both gets the consent email first; questions deferred");
    assert.equal(r.pending_questions.deferred, 1);
    assert.deepEqual(w.sent, []);
    assert.deepEqual(w.writes, [], "dry run never writes the ledger");
    const r2 = await runConsentQuestionsNudge(w.deps(), { now: NOW, env: { CONSENT_NUDGE_ENABLED: "1" } });
    assert.equal(r2.dryRun, true, "only the exact value true enables sending");
  }
  // Flag ON: sends, one email per user per run, ledger claimed.
  {
    const w = fakeWorld();
    const r = await runConsentQuestionsNudge(w.deps(), { now: NOW, env: { CONSENT_NUDGE_ENABLED: "true" } });
    assert.equal(r.dryRun, false);
    assert.deepEqual(w.sent.map((s) => [s.email, s.kind]).sort(), [["both@x.it", "privacy_consent"], ["held@x.it", "privacy_consent"], ["q@x.it", "pending_questions"]]);
    assert.ok(w.sent.find((s) => s.email === "q@x.it")!.subject.startsWith("2 candidature"));
    assert.equal(w.ledgers.length, 3);
    assert.ok(w.ledgers.every((l) => l.sentCount === 1 && l.lastSentAt?.getTime() === NOW.getTime() && l.lastProviderEmailId?.startsWith("re_")));
    // Same day again: cooldown, nothing sent (u-both's questions now come up but its consent cooldown doesn't block the other kind).
    const again = await runConsentQuestionsNudge(w.deps(), { now: new Date(NOW.getTime() + 3600_000), env: { CONSENT_NUDGE_ENABLED: "true" } });
    assert.equal(again.privacy_consent.throttled.cooldown, 2);
    assert.equal(again.pending_questions.throttled.cooldown, 1);
    assert.deepEqual(w.sent.slice(3).map((s) => [s.email, s.kind]), [["both@x.it", "pending_questions"]]);
    // Three days later, then twice more: cap of 3 per kind.
    for (let i = 1; i <= 4; i++) await runConsentQuestionsNudge(w.deps(), { now: new Date(NOW.getTime() + i * NUDGE_COOLDOWN_DAYS * DAY + 7200_000), env: { CONSENT_NUDGE_ENABLED: "true" } });
    const heldEmails = w.sent.filter((s) => s.email === "held@x.it");
    assert.equal(heldEmails.length, NUDGE_MAX_PER_KIND, "at most 3 consent nudges ever");
    assert.ok(w.ledgers.every((l) => l.sentCount <= NUDGE_MAX_PER_KIND));
  }
  // Opt-out, bounce and send failure.
  {
    const w = fakeWorld({ ledgers: [
      { userId: "u-held", kind: "privacy_consent", optedOutAt: ago(1) },
      { userId: "u-q", kind: "privacy_consent", sentCount: 1, lastSentAt: ago(10) },
    ] });
    const bounced = w.ledgers.find((l) => l.userId === "u-q")!;
    await recordNudgeEmailEvent({ nudgeId: bounced.id, type: "email.delivered", occurredAt: ago(9) }, w.db);
    assert.equal(bounced.bouncedAt, null, "delivery events change nothing");
    await recordNudgeEmailEvent({ nudgeId: bounced.id, type: "email.bounced", occurredAt: ago(9) }, w.db);
    assert.ok(bounced.bouncedAt);
    const r = await runConsentQuestionsNudge(w.deps({ failFor: "u-both" }), { now: NOW, env: { CONSENT_NUDGE_ENABLED: "true" } });
    assert.equal(r.privacy_consent.throttled.opted_out, 1);
    assert.equal(r.pending_questions.throttled.bounced, 1, "a bounce on any nudge stops every nudge kind");
    assert.equal(r.privacy_consent.failed, 1);
    assert.deepEqual(w.sent, []);
    const both = w.ledgers.find((l) => l.userId === "u-both")!;
    assert.equal(both.sentCount, 0, "failed send releases the claimed slot");
    assert.equal(both.lastSentAt, null);
  }
  // Holds: notification hold, applications paused, quota reserve, batch cap, missing ledger table.
  {
    const w = fakeWorld();
    const held = await runConsentQuestionsNudge(w.deps({ heldGate: () => ({ held: true, reason: "hold" }) }), { now: NOW, env: { CONSENT_NUDGE_ENABLED: "true" } });
    assert.equal(held.held, "user_notifications_hold");
    const paused = await runConsentQuestionsNudge(w.deps({ applicationsPaused: () => true }), { now: NOW, env: { CONSENT_NUDGE_ENABLED: "true" } });
    assert.equal(paused.held, "applications_paused");
    assert.deepEqual(w.sent, []);
    w.setQuota(55);
    const reserve = await runConsentQuestionsNudge(w.deps(), { now: NOW, env: { CONSENT_NUDGE_ENABLED: "true" } });
    assert.equal(reserve.stoppedBy, "quota_reserve", "keeps 40 of the 95 daily emails for application mail");
    assert.deepEqual(w.sent, []);
    w.setQuota(0);
    const capped = await runConsentQuestionsNudge(w.deps(), { now: NOW, env: { CONSENT_NUDGE_ENABLED: "true", CONSENT_NUDGE_BATCH_CAP: "2" } });
    assert.equal(capped.stoppedBy, "batch_cap");
    assert.deepEqual(w.sent.map((x) => x.email), ["held@x.it", "both@x.it"], "held-consent users and users with waiting answers go first (consent before questions)");
    const m = fakeWorld({ missingTable: true });
    const dry = await runConsentQuestionsNudge(m.deps(), { now: NOW, env: {} });
    assert.equal(dry.ledgerMissing, true);
    assert.equal(dry.privacy_consent.wouldSend, 2, "dry run still counts before the migration is applied");
    const on = await runConsentQuestionsNudge(m.deps(), { now: NOW, env: { CONSENT_NUDGE_ENABLED: "true" } });
    assert.equal(on.held, "ledger_missing", "never sends without the throttle ledger");
    assert.deepEqual(m.sent, []);
  }
  console.log("PASS consent/questions nudge: flag off = dry run, selection, 3-day/3-total throttle, opt-out, bounce, holds, quota reserve");
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
