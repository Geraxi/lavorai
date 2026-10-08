import assert from "node:assert/strict";
import {
  isCheckoutRecoveryWindow,
  isInVerifyReminderWindow,
  isVerifyReminderDue,
  trialLifecycleStage,
} from "../src/lib/lifecycle-cadence";
import { renderVerifyReminder } from "../src/lib/verify-reminder";

const day = 86_400_000;
const start = new Date("2026-01-01T09:00:00.000Z");
const end = new Date(start.getTime() + 7 * day);

assert.equal(trialLifecycleStage({ now: start.getTime() + 2 * day, createdAt: start, trialEndsAt: end }), null);
assert.equal(trialLifecycleStage({ now: start.getTime() + 3 * day, createdAt: start, trialEndsAt: end }), "day_3");
assert.equal(trialLifecycleStage({ now: start.getTime() + 5 * day + 2 * 3_600_000, createdAt: start, trialEndsAt: end }), "day_6");
assert.equal(trialLifecycleStage({ now: end.getTime() + 1, createdAt: start, trialEndsAt: end }), "ended");
assert.equal(trialLifecycleStage({ now: end.getTime() + 4 * day, createdAt: start, trialEndsAt: end }), null);

const now = Date.parse("2026-01-10T12:00:00.000Z");
assert.equal(isCheckoutRecoveryWindow(new Date(now - 90 * 60_000), now), false);
assert.equal(isCheckoutRecoveryWindow(new Date(now - 3 * 3_600_000), now), true);
assert.equal(isCheckoutRecoveryWindow(new Date(now - 73 * 3_600_000), now), false);

// Verify-email reminder: ~24h after signup, unverified only, max 7 days.
const signup = new Date(start.getTime());
const h = 3_600_000;
assert.equal(isVerifyReminderDue({ now: signup.getTime() + 23 * h, createdAt: signup, emailVerified: null }), false);
assert.equal(isVerifyReminderDue({ now: signup.getTime() + 24 * h, createdAt: signup, emailVerified: null }), true);
assert.equal(isVerifyReminderDue({ now: signup.getTime() + 30 * h, createdAt: signup, emailVerified: new Date() }), false);
assert.equal(isVerifyReminderDue({ now: signup.getTime() + 8 * day, createdAt: signup, emailVerified: null }), false);
assert.equal(isInVerifyReminderWindow(signup, signup.getTime() + 2 * day), true);
assert.equal(isInVerifyReminderWindow(signup, signup.getTime() + 8 * day), false);

// Trial "2 days before end" reminder lands on day 5 of a 7-day trial.
assert.equal(trialLifecycleStage({ now: start.getTime() + 5 * day, createdAt: start, trialEndsAt: end }), "day_6");
assert.equal(trialLifecycleStage({ now: start.getTime() + 4 * day + 23 * h, createdAt: start, trialEndsAt: end }), "day_3");

const it = renderVerifyReminder({ name: "Marco Rossi", locale: "it", verifyUrl: "https://lavorai.it/verify-email?token=abc" });
assert.match(it.subject, /Conferma la tua email/);
assert.match(it.html, /Ciao Marco,/);
assert.match(it.html, /verify-email\?token=abc/);
assert.match(it.html, /lang="it"/);
const en = renderVerifyReminder({ name: null, locale: "en", verifyUrl: "https://lavorai.it/verify-email?token=xyz" });
assert.match(en.subject, /Confirm your email/);
assert.match(en.html, /token=xyz/);

console.log("Growth lifecycle cadence checks passed.");
