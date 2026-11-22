/** Settings-blocker nudges: detection, audience, flag, throttle, quota, copy. No DB, no email. */
import assert from "node:assert/strict";
import {
  detectSettingsBlocker, selectSettingsCandidates, runSettingsBlockerNudge, renderSettingsNudgeEmail, blockerCopy,
  getSettingsBlockerForUser, settingsNudgeEnabled, SETTINGS_NUDGE_KIND, SETTINGS_NUDGE_MAX, type SettingsCandidateUser, type SettingsNudgeDeps,
} from "../src/lib/settings-blocker-nudge";
import { isScheduledUserNotificationKind } from "../src/lib/user-notification-guard";
import { verifyOneClick } from "../src/lib/one-click-token";

const NOW = new Date("2026-11-18T08:45:00.000Z");
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);
const prefs = (o: object = {}) => ({ autoApplyMode: "auto", salaryMin: 30, matchMin: 50, locationsJson: '["Milano","Remote"]', ...o });
const input = (o: object = {}) => ({ onboardedAt: ago(20), hasCv: true, privacyConsentAt: ago(20), createdAt: ago(30), prefs: prefs(), recentApplications: 0, ...o });

// ---- detection: the real blocked shapes ----
{
  // Paola: not onboarded
  assert.equal(detectSettingsBlocker(input({ onboardedAt: null, prefs: prefs({ matchMin: 80 }) }), NOW)?.blocker, "onboarding_incomplete");
  // Tiziana: no CV, no consent, not onboarded → onboarding first, consent line present
  const t = detectSettingsBlocker(input({ onboardedAt: null, hasCv: false, privacyConsentAt: null }), NOW)!;
  assert.equal(t.blocker, "onboarding_incomplete"); assert.equal(t.needsConsent, true);
  assert.equal(detectSettingsBlocker(input({ hasCv: false, privacyConsentAt: null }), NOW)?.blocker, "missing_cv");
  // Notami: mode off
  assert.equal(detectSettingsBlocker(input({ prefs: prefs({ autoApplyMode: "off" }) }), NOW)?.blocker, "auto_apply_off");
  // Giorgia: salary 45k, Torino + remote, 0 apps
  const g = detectSettingsBlocker(input({ prefs: prefs({ salaryMin: 45, locationsJson: '["Torino","Remote"]' }) }), NOW)!;
  assert.equal(g.blocker, "narrow_preferences");
  assert.ok(g.blocker === "narrow_preferences" && g.details.salaryMin === 45 && g.details.hasRemote);
  // Matteo: Brescia only → suggest Milano + remote
  const m = detectSettingsBlocker(input({ prefs: prefs({ locationsJson: '["Brescia","Bergamo"]' }) }), NOW)!;
  assert.ok(m.blocker === "narrow_preferences");
  assert.deepEqual(m.blocker === "narrow_preferences" && m.details.suggestedCities, ["Milano"]);
  assert.match(blockerCopy(m, "it").lines.join(" "), /aggiungere Milano/);
  assert.match(blockerCopy(m, "it").lines.join(" "), /includere il lavoro da remoto/);
  // Not blocked: recent applications, default filters, too new, consent-only (consent nudge owns it)
  assert.equal(detectSettingsBlocker(input({ recentApplications: 2, prefs: prefs({ salaryMin: 60 }) }), NOW), null);
  assert.equal(detectSettingsBlocker(input(), NOW), null, "default filters with remote: nothing concrete to suggest");
  assert.equal(detectSettingsBlocker(input({ createdAt: ago(3), prefs: prefs({ salaryMin: 60 }) }), NOW), null);
  assert.equal(detectSettingsBlocker(input({ privacyConsentAt: null, prefs: prefs({ salaryMin: 60 }) }), NOW), null);
}

// ---- audience ----
const user = (o: Partial<SettingsCandidateUser> = {}): SettingsCandidateUser => ({
  id: "u1", email: "u1@x.it", name: "Giorgia Bianchi", locale: "it", emailVerified: ago(30), suspendedAt: null, privacyConsentAt: ago(30),
  onboardedAt: null, createdAt: ago(30), tier: "pro", subscriptionStatus: "active", trialEndsAt: null, trialGraceEndsAt: null,
  trialExtensionEndsAt: null, currentPeriodEnd: new Date(NOW.getTime() + 20 * DAY), preferences: prefs(), _count: { cvDocuments: 1, applications: 0 }, ...o,
});
const isTest = (e: string) => e.endsWith("@test.lavorai");
{
  const sel = selectSettingsCandidates([
    user(),
    user({ id: "trial", email: "t@x.it", subscriptionStatus: "trialing", trialEndsAt: new Date(NOW.getTime() + 3 * DAY) }),
    user({ id: "free", email: "f@x.it", tier: "free", subscriptionStatus: null }),
    user({ id: "canceled", email: "c@x.it", subscriptionStatus: "canceled" }),
    user({ id: "susp", email: "s@x.it", suspendedAt: ago(1) }),
    user({ id: "unver", email: "v@x.it", emailVerified: null }),
    user({ id: "test", email: "x@test.lavorai" }),
  ], isTest, NOW);
  assert.deepEqual(sel.map((s) => s.userId), ["u1", "trial"]);
}

async function main() {
// ---- flag + banner ----
assert.equal(settingsNudgeEnabled({}), false);
assert.equal(settingsNudgeEnabled({ SETTINGS_NUDGE_ENABLED: "1" }), false);
assert.equal(settingsNudgeEnabled({ SETTINGS_NUDGE_ENABLED: " TRUE " }), true);
assert.equal(await getSettingsBlockerForUser("u1", {}), null, "banner off by default (no DB touched)");
assert.ok(isScheduledUserNotificationKind("settings_blocker_nudge"), "held by USER_NOTIFICATIONS_HOLD");

// ---- runner ----
function fakeDeps(users: SettingsCandidateUser[], ledgers: any[] = [], quota = { today: 0, daily: 95 }) {
  const writes: string[] = []; const sends: string[] = []; const rows = new Map<string, any>();
  for (const l of ledgers) rows.set(`${l.userId}:${l.kind}`, { id: `${l.userId}:${l.kind}`, ...l });
  const db: any = {
    user: { findMany: async () => users },
    userNudge: {
      findMany: async () => [...rows.values()],
      upsert: async ({ where }: any) => { writes.push("upsert"); const k = `${where.userId_kind.userId}:${where.userId_kind.kind}`;
        if (!rows.has(k)) rows.set(k, { id: k, userId: where.userId_kind.userId, kind: where.userId_kind.kind, sentCount: 0, lastSentAt: null, optedOutAt: null, bouncedAt: null });
        return rows.get(k); },
      updateMany: async ({ where, data }: any) => { writes.push("updateMany"); const r = rows.get(where.id);
        if (data.sentCount?.increment) { if (r.sentCount >= SETTINGS_NUDGE_MAX || r.optedOutAt) return { count: 0 }; r.sentCount++; r.lastSentAt = data.lastSentAt; }
        else if (data.sentCount?.decrement) { r.sentCount--; r.lastSentAt = data.lastSentAt; }
        return { count: 1 }; },
      update: async () => { writes.push("update"); return {}; },
    },
  };
  const deps: SettingsNudgeDeps = {
    db, isTest, quota: async () => quota, heldGate: () => ({ held: false }), log: () => {},
    send: async (c, msg) => { sends.push(c.userId); assert.ok(msg.subject && msg.html && msg.text.includes("nudge-optout")); return { sent: true, providerEmailId: "re_1" }; },
  };
  return { deps, writes, sends, rows };
}
{
  // dry run: counts only, no writes, no sends
  const f = fakeDeps([user(), user({ id: "u2", email: "u2@x.it", onboardedAt: ago(5), preferences: prefs({ autoApplyMode: "off" }) })]);
  const r = await runSettingsBlockerNudge(f.deps, { now: NOW, env: {} });
  assert.equal(r.dryRun, true); assert.equal(r.wouldSend, 2); assert.equal(r.byBlocker.onboarding_incomplete, 1); assert.equal(r.byBlocker.auto_apply_off, 1);
  assert.deepEqual(f.writes, []); assert.deepEqual(f.sends, []);
}
{
  const env = { SETTINGS_NUDGE_ENABLED: "true" };
  const f = fakeDeps([user()]);
  const r = await runSettingsBlockerNudge(f.deps, { now: NOW, env });
  assert.equal(r.sent, 1); assert.deepEqual(f.sends, ["u1"]);
  // cooldown: second run same day sends nothing
  const r2 = await runSettingsBlockerNudge(f.deps, { now: NOW, env });
  assert.equal(r2.sent, 0); assert.equal(r2.throttled, 1);
  // held gate
  const h = fakeDeps([user()]); h.deps.heldGate = () => ({ held: true, reason: "hold" });
  assert.equal((await runSettingsBlockerNudge(h.deps, { now: NOW, env })).held, "user_notifications_hold"); assert.deepEqual(h.sends, []);
  // quota reserve (default 40 of 95)
  const q = fakeDeps([user()], [], { today: 56, daily: 95 });
  const rq = await runSettingsBlockerNudge(q.deps, { now: NOW, env });
  assert.equal(rq.stoppedBy, "quota_reserve"); assert.deepEqual(q.sends, []);
  // batch cap
  const c = fakeDeps([user(), user({ id: "u2", email: "u2@x.it" })]);
  const rc = await runSettingsBlockerNudge(c.deps, { now: NOW, env: { ...env, SETTINGS_NUDGE_BATCH_CAP: "1" } });
  assert.equal(rc.sent, 1); assert.equal(rc.stoppedBy, "batch_cap");
  // opted out, bounced on another kind, max reached, other nudge in last 24h
  const o = fakeDeps([user(), user({ id: "b", email: "b@x.it" }), user({ id: "m", email: "m@x.it" }), user({ id: "r", email: "r@x.it" })], [
    { userId: "u1", kind: SETTINGS_NUDGE_KIND, sentCount: 0, lastSentAt: null, optedOutAt: ago(1), bouncedAt: null },
    { userId: "b", kind: "privacy_consent", sentCount: 1, lastSentAt: ago(10), optedOutAt: null, bouncedAt: ago(9) },
    { userId: "m", kind: SETTINGS_NUDGE_KIND, sentCount: SETTINGS_NUDGE_MAX, lastSentAt: ago(30), optedOutAt: null, bouncedAt: null },
    { userId: "r", kind: "pending_questions", sentCount: 1, lastSentAt: new Date(NOW.getTime() - 3_600_000), optedOutAt: null, bouncedAt: null },
  ]);
  const ro = await runSettingsBlockerNudge(o.deps, { now: NOW, env });
  assert.equal(ro.sent, 0); assert.equal(ro.throttled, 3); assert.equal(ro.recentOtherNudge, 1); assert.deepEqual(o.sends, []);
  // send failure releases the slot
  const e = fakeDeps([user()]); e.deps.send = async () => { throw new Error("boom"); };
  const re = await runSettingsBlockerNudge(e.deps, { now: NOW, env });
  assert.equal(re.failed, 1); assert.equal(e.rows.get(`u1:${SETTINGS_NUDGE_KIND}`).sentCount, 0);
}

// ---- copy ----
{
  const c = { userId: "u1", email: "u1@x.it", name: "Tiziana <b>X</b>", locale: "it",
    result: detectSettingsBlocker(input({ hasCv: false, privacyConsentAt: null }), NOW)! };
  const m = renderSettingsNudgeEmail(c, { NEXT_PUBLIC_SITE_URL: "https://lavorai.it" });
  assert.match(m.subject, /CV/); assert.match(m.html, /https:\/\/lavorai\.it\/cv/);
  assert.ok(!m.html.includes("<b>X</b>"), "name escaped");
  assert.match(m.text, /non lo diamo mai al posto tuo/);
  const token = decodeURIComponent(new URL(m.optOutUrl).searchParams.get("t")!);
  assert.equal(verifyOneClick(token, `nudge-optout:${SETTINGS_NUDGE_KIND}`)?.userId, "u1");
  const city = renderSettingsNudgeEmail({ ...c, result: detectSettingsBlocker(input({ prefs: prefs({ locationsJson: '["<script>x</script>"]', salaryMin: 50 }) }), NOW)! });
  assert.ok(!city.html.includes("<script>"), "user cities escaped");
  for (const r of [input({ onboardedAt: null }), input({ hasCv: false }), input({ prefs: prefs({ autoApplyMode: "off" }) }), input({ prefs: prefs({ salaryMin: 45 }) })]) {
    for (const loc of ["it", "en"]) {
      const copy = blockerCopy(detectSettingsBlocker(r, NOW)!, loc);
      assert.ok(copy.title && copy.subject && copy.cta.href.startsWith("/"));
      assert.doesNotMatch(copy.lines.join(" "), /abbiamo (attivato|dato il consenso)|we (turned on|consented)/i);
    }
  }
}

console.log("PASS settings-blocker-nudge: detection (onboarding, CV+consent line, auto-apply off, narrow salary/cities), Pro/trial audience, flag default off (banner + email), dry run zero writes, cooldown, opt-out/bounce/max, 24h other-nudge spacing, quota reserve, batch cap, release on failure, escaped copy, opt-out token");
}

main().catch((err) => { console.error(err); process.exit(1); });
