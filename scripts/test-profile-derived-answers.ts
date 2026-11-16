/**
 * Fields derivable from the candidate's own profile are answered; nothing is
 * invented. EEO, salary and essay questions stay manual. No browser, no DB.
 */
import assert from "node:assert/strict";
import { candidateFacts, jobCountryIso, resolveCandidateFact, reusableFactKey, type FactContext } from "../src/lib/candidate-facts";
import { greenhouseRequiredQuestionsAnswerable } from "../src/lib/greenhouse-job-form";
import type { CVProfile } from "../src/lib/cv-profile-types";

const now = new Date("2026-11-16T12:00:00Z");
const profile: CVProfile = {
  firstName: "Giulia", lastName: "Bianchi", email: "giulia@example.test", phone: "+39 333 1234567",
  city: "Milano", title: "Engineer", summary: "", skills: [], languages: [], education: [], experiences: [],
  links: [{ label: "LinkedIn", url: "https://www.linkedin.com/in/giulia" }],
};
const ctx = (extra: Partial<FactContext> = {}, user: Parameters<typeof candidateFacts>[1] = {}, p: CVProfile | null = profile): FactContext => ({
  facts: candidateFacts(p, { email: "giulia@example.test", ...user }, {}, [], now), ...extra,
});
const ask = (label: string, c: FactContext, kind = "text", options?: string[]) => resolveCandidateFact({ label, kind, options }, c).answer;

// Phone country code: from the CV phone prefix, across label variants.
for (const label of ["Phone country code", "Country code for phone number", "Phone Country Code (e.g. +39)", "Dialing code", "Prefisso internazionale", "Mobile country code"]) {
  assert.equal(reusableFactKey(label), "phoneCountry", label);
}
assert.equal(ask("Phone country code", ctx(), "select", ["Germany (+49)", "Italy (+39)", "France (+33)"]), "Italy (+39)");
assert.match(ask("Country code for phone number", ctx()) ?? "", /\+39/);
// No prefix and no city: unknown, never guessed.
assert.equal(ask("Phone country code", ctx({}, {}, { ...profile, phone: "333 1234567", city: "" }), "select", ["Italy (+39)", "Germany (+49)"]), null);

// Country of residence and city come from the CV city.
assert.equal(ask("Country of residence", ctx()), "Italia");
assert.equal(ask("City", ctx()), "Milano");
assert.equal(ask("Country of residence", ctx({}, {}, { ...profile, city: "" })), null, "no CV city → no residence country");

// LinkedIn from CV links; portfolio from UserPreferences.portfolioUrl.
assert.equal(ask("LinkedIn profile", ctx()), "https://www.linkedin.com/in/giulia");
assert.equal(ask("Portfolio", ctx({}, { portfolioUrl: "https://giulia.design" })), "https://giulia.design");
assert.equal(ask("Portfolio", ctx({}, { portfolioUrl: "not a url" })), null);
assert.equal(ask("LinkedIn profile", ctx({}, { portfolioUrl: "https://linkedin.com/in/giulia-b" }, { ...profile, links: [] })), "https://linkedin.com/in/giulia-b");

// Start date / notice from User.noticePeriod ("1m" enum) and availableFrom.
assert.equal(ask("Notice period", ctx({}, { noticePeriod: "1m" })), "1 month");
assert.equal(ask("Notice period", ctx({}, { noticePeriod: "1m" }), "select", ["Immediately", "1 month", "3 months"]), "1 month");
assert.equal(ask("Earliest start date", ctx({}, { availableFrom: "2027-01-15" })), "2027-01-15");
assert.equal(ask("Earliest start date", ctx({}, { availableFrom: "2026-01-15" })), null, "past date is stale");
assert.equal(ask("When can you start", ctx({}, { availableFrom: "immediate" })), "Immediate");
assert.equal(resolveCandidateFact({ label: "Notice period", kind: "text" }, ctx({}, { noticePeriod: "immediate", availableFrom: "2 settimane" })).conflict, true, "disagreeing sources stay manual");

// Right to work: only from a submitted EU authorisation + an EU job in the asked country.
const eu = (jobLocation: string | null) => ctx({ jobLocation }, { euAuthorized: true });
assert.equal(jobCountryIso("Amsterdam, Netherlands"), "NL");
assert.equal(jobCountryIso("Remote"), null);
assert.equal(ask("Are you legally authorized to work in the Netherlands?", eu("Amsterdam, Netherlands"), "select", ["Yes", "No"]), "Yes");
assert.equal(ask("Do you have the right to work in the EU?", eu("Berlin, Germany"), "radio", ["Yes", "No"]), "Yes");
assert.equal(ask("Are you legally authorized to work in Germany?", eu("Amsterdam, Netherlands"), "select", ["Yes", "No"]), null, "different country than the job");
assert.equal(ask("Do you have the right to work in the UK?", eu("London, United Kingdom"), "select", ["Yes", "No"]), null, "non-EU");
assert.equal(ask("Are you legally authorized to work in the Netherlands?", eu("Remote"), "select", ["Yes", "No"]), null, "unknown job country");
assert.equal(ask("Are you legally authorized to work in the Netherlands?", ctx({ jobLocation: "Amsterdam, Netherlands" }), "select", ["Yes", "No"]), null, "no statement");
assert.equal(ask("Are you legally authorized to work in the Netherlands?", ctx({ jobLocation: "Amsterdam, Netherlands" }, { euAuthorized: false }), "select", ["Yes", "No"]), null, "never answers No");
assert.equal(ask("Will you require visa sponsorship to work in the Netherlands?", eu("Amsterdam, Netherlands"), "select", ["Yes", "No"]), null, "sponsorship stays manual");
const conflicting: FactContext = { jobLocation: "Amsterdam, Netherlands", facts: candidateFacts(profile, { euAuthorized: true }, { workAuthEU: "no_needs_sponsorship" }, [], now) };
assert.equal(ask("Are you legally authorized to work in the Netherlands?", conflicting, "select", ["Yes", "No"]), null);

// EEO, salary and essays stay manual.
for (const label of ["Gender", "Veteran status", "Expected salary", "Why do you want to work at Stripe?"]) {
  assert.equal(ask(label, ctx({ jobLocation: "Dublin, Ireland" }, { euAuthorized: true, noticePeriod: "1m" }), "text"), null, label);
}

// The proven-channel answerable check sees the same derivations.
const questions = [
  { label: "First Name", kind: "text", required: true },
  { label: "Phone country code", kind: "select", required: true, options: ["Italy (+39)", "Spain (+34)"] },
  { label: "Are you legally authorized to work in Ireland?", kind: "select", required: true, options: ["Yes", "No"] },
  { label: "LinkedIn Profile", kind: "text", required: true },
] as Parameters<typeof greenhouseRequiredQuestionsAnswerable>[0];
assert.equal(greenhouseRequiredQuestionsAnswerable(questions, eu("Dublin, Ireland"), { hasCv: true }).ok, true);
assert.deepEqual(greenhouseRequiredQuestionsAnswerable(questions, ctx({ jobLocation: "Dublin, Ireland" }), { hasCv: true }).missing, ["Are you legally authorized to work in Ireland?"]);

console.log("PASS profile-derived answers: phone code, residence, LinkedIn/portfolio, start date, EU right to work (job country only); EEO/salary/essays/sponsorship manual; answerable check aligned.");
