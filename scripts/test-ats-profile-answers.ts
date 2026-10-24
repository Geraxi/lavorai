/**
 * Production Ashby/Recruitee/Lever labels must map from CVProfile/User
 * before the worker pauses in needs_answers. No browser, no network.
 */
import assert from "node:assert/strict";
import { candidateFacts, isPrivacyConsentQuestion, resolveCandidateFact, reusableFactKey } from "../src/lib/candidate-facts";
import { isReusableProfileQuestion } from "../src/lib/application-question-answers";
import { canaryScreenshotFilename, sanitizeFormLabel } from "../src/lib/portal-adapters/form-labels";
import type { CVProfile } from "../src/lib/cv-profile-types";

const profile: CVProfile = {
  firstName: "Mario", lastName: "Rossi", email: "mario@example.test", phone: "+39 333 1234567",
  city: "Milano", title: "Engineer", summary: "", skills: [], languages: [], education: [],
  experiences: [], links: [{ label: "LinkedIn", url: "https://linkedin.com/in/mario" }],
};

const user = { name: "Mario Rossi", phone: "+39 333 1234567", noticePeriod: "1month" as const };
const answers = { salaryExpectationEur: 65_000, linkedinUrl: "https://linkedin.com/in/mario", howHeard: "linkedin" as const };
const facts = candidateFacts(profile, user, answers);

const productionLabels: Array<[string, string]> = [
  ["Name", "fullName"],
  ["Phone", "phone"],
  ["Phone Number", "phone"],
  ["Best Contact Number", "phone"],
  ["LinkedIn Profile URL", "linkedinUrl"],
  ["Location", "city"],
  ["Available from", "noticePeriod"],
  ["Earliest start date", "noticePeriod"],
  ["Salary expectations", "salaryExpectationEur"],
  ["Where did you hear about us", "howHeard"],
];

for (const [label, key] of productionLabels) {
  assert.equal(reusableFactKey(label), key, label);
  assert.equal(isReusableProfileQuestion({ label, kind: "text" }), true, label);
}

assert.equal(reusableFactKey("Expected salary"), null, "Bare expected salary stays ambiguous");
assert.equal(reusableFactKey("I agree to the terms"), null);

const resolved = Object.fromEntries(productionLabels.map(([label]) => {
  const question = label === "Where did you hear about us"
    ? { label, kind: "select", options: ["LinkedIn", "Google", "Other"] }
    : { label, kind: "text" };
  return [label, resolveCandidateFact(question, { facts }).answer];
}));
assert.equal(resolved.Name, "Mario Rossi");
assert.equal(resolved.Phone, "+39 333 1234567");
assert.equal(resolved["Phone Number"], "+39 333 1234567");
assert.equal(resolved["Best Contact Number"], "+39 333 1234567");
assert.equal(resolved["LinkedIn Profile URL"], "https://linkedin.com/in/mario");
assert.equal(resolved.Location, "Milano");
assert.equal(resolved["Available from"], "1 month");
assert.equal(resolved["Earliest start date"], "1 month");
assert.equal(resolved["Salary expectations"], "65000");
assert.equal(resolved["Where did you hear about us"], "LinkedIn");

const fromUserOnly = candidateFacts(
  { ...profile, firstName: "", lastName: "", phone: "", links: [], city: "" },
  { name: "Anna Bianchi", phone: "+39 02 111", noticePeriod: "2weeks" },
  { salaryExpectationEur: 80_000, linkedinUrl: "https://linkedin.com/in/anna" },
);
assert.equal(resolveCandidateFact({ label: "Name", kind: "text" }, { facts: fromUserOnly }).answer, "Anna Bianchi");
assert.equal(resolveCandidateFact({ label: "Best Contact Number", kind: "text" }, { facts: fromUserOnly }).answer, "+39 02 111");
assert.equal(resolveCandidateFact({ label: "LinkedIn Profile URL", kind: "text" }, { facts: fromUserOnly }).answer, "https://linkedin.com/in/anna");

const reused = candidateFacts(null, {}, {}, [{
  label: "Where did you hear about us", kind: "select", answer: "LinkedIn", source: "user",
  answeredAt: new Date("2026-10-01T00:00:00Z"), optionsJson: JSON.stringify(["LinkedIn", "Google", "Other"]),
}]);
assert.equal(resolveCandidateFact({
  label: "How did you hear about us?", kind: "select", options: ["LinkedIn", "Indeed", "Other"],
}, { facts: reused }).answer, "LinkedIn", "Standard answers reuse across applications before pause");
assert.equal(isReusableProfileQuestion({ label: "Where did you hear about us", kind: "select" }), true);
assert.equal(isReusableProfileQuestion({ label: "I agree to the privacy policy", kind: "checkbox" }), false);

assert.equal(isPrivacyConsentQuestion("I agree to the privacy policy"), true);
assert.equal(isPrivacyConsentQuestion("Accetto l'informativa privacy"), true);
assert.equal(isPrivacyConsentQuestion("I consent to the processing of my personal data (GDPR)"), true);
assert.equal(isPrivacyConsentQuestion("I agree to the terms"), false);
assert.equal(isPrivacyConsentQuestion("I certify that I hold the required license"), false);
assert.equal(resolveCandidateFact({ label: "I agree to the privacy policy", kind: "checkbox" }, { facts }).answer, null);
assert.equal(resolveCandidateFact({ label: "I agree to the privacy policy", kind: "checkbox" }, { facts, privacyConsentAt: new Date() }).answer, "Yes");
assert.equal(resolveCandidateFact({ label: "I agree to the terms", kind: "checkbox" }, { facts, privacyConsentAt: new Date() }).answer, null);

assert.equal(sanitizeFormLabel("cards[field-abc]"), "");
assert.equal(sanitizeFormLabel("cards[0][value]"), "");
assert.equal(sanitizeFormLabel("+1United States+44United Kingdom+39Italy"), "");
assert.equal(sanitizeFormLabel("United StatesUnited KingdomAfghanistanAlbaniaAlgeria"), "");
assert.equal(sanitizeFormLabel("LinkedIn Profile URL"), "LinkedIn Profile URL");
assert.equal(sanitizeFormLabel("Best Contact Number *"), "Best Contact Number *");

const shotA = canaryScreenshotFilename("post-submit");
const shotB = canaryScreenshotFilename("post-submit");
assert.match(shotA, /^canary\/[a-f0-9]{32}-post-submit\.png$/);
assert.notEqual(shotA, shotB);
assert.doesNotMatch(shotA, /noid|application/i);

console.log("ats-profile-answers: production labels, reuse, privacy consent, Lever noise, screenshot paths ok");
