import assert from "node:assert/strict";
import en from "../messages/en.json";
import it from "../messages/it.json";
import { applyPublicCardTrialMessages, getPublicCardTrialCopy, publicCardTrialRolloutActive } from "../src/lib/card-trial-copy";
const originalStart = process.env.CARD_TRIAL_COHORT_START;
const originalReady = process.env.CARD_TRIAL_PROVIDER_READY;
const originalKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.OPENAI_MODEL_STRONG;
try {
  delete process.env.CARD_TRIAL_COHORT_START;
  assert.equal(applyPublicCardTrialMessages(en, "en"), en);
  assert.equal(applyPublicCardTrialMessages(it, "it"), it);
  process.env.CARD_TRIAL_COHORT_START = "2099-01-01T00:00:00Z";
  assert.equal(publicCardTrialRolloutActive(new Date("2026-10-12")), false);
  process.env.CARD_TRIAL_COHORT_START = "2020-01-01T00:00:00Z";
  delete process.env.CARD_TRIAL_PROVIDER_READY;
  assert.match(getPublicCardTrialCopy("en").disclosure, /temporarily unavailable/);
  assert.doesNotMatch(getPublicCardTrialCopy("en").cta, /Start/);
  process.env.CARD_TRIAL_PROVIDER_READY = "verified";
  process.env.OPENAI_API_KEY = "offline-test-placeholder";
  process.env.OPENAI_MODEL_STRONG = "offline-model";
  for (const [locale, dict] of [["en", en], ["it", it]] as const) {
    const active = applyPublicCardTrialMessages(dict, locale);
    assert.equal(active.cardTrial.mode, "active");
    assert.equal(active.cardTrial.availability, "available");
    assert.match(active.auth.signupSubheading, /3/);
    assert.match(active.auth.signupSubheading, /19[.,]99/);
    assert.match(active.auth.signupSubheading, /39[.,]99/);
    assert.match(active.auth.signupSubheading, /50/);
    for (const value of [active.hero.ctaCaption, active.pricing.subtitle, active.auth.signupSubheading, active.analizzaCvPage.caption, active.leadMagnet.subtitle]) {
      assert.doesNotMatch(value, /7.day|7 giorni|no card|senza carta|No signup|Niente registrazione|3 free|3 audit gratuiti/i);
    }
    // Existing app lifecycle messages and source dictionary are untouched.
    assert.deepEqual(active.dashboardPage, dict.dashboardPage);
    assert.deepEqual(active.onboarding, dict.onboarding);
    assert.equal(dict.cardTrial.mode, "legacy");
  }
  delete process.env.CARD_TRIAL_COHORT_START;
  const persisted = applyPublicCardTrialMessages(en, "en", true);
  assert.equal(persisted.cardTrial.mode, "active");
  assert.equal(persisted.cardTrial.availability, "unavailable");
  assert.match(persisted.auth.signupSubheading, /temporarily unavailable/);
  assert.match(persisted.referral.title, /under review/);
  assert.doesNotMatch(persisted.referral.title, /One month/);
  assert.equal(applyPublicCardTrialMessages(en, "en", false), en);
  process.env.CARD_TRIAL_COHORT_START = "bad";
  assert.throws(() => getPublicCardTrialCopy(), /Invalid/);
  console.log("Card-trial public copy: disabled, future cutoff, unavailable, IT/EN ready, legacy preservation passed.");
} finally {
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.OPENAI_MODEL_STRONG; else process.env.OPENAI_MODEL_STRONG = originalModel;
  if (originalStart === undefined) delete process.env.CARD_TRIAL_COHORT_START; else process.env.CARD_TRIAL_COHORT_START = originalStart;
  if (originalReady === undefined) delete process.env.CARD_TRIAL_PROVIDER_READY; else process.env.CARD_TRIAL_PROVIDER_READY = originalReady;
}
