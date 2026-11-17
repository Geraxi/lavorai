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

// 17 Nov 2026 Stripe form: the live option list carries every territory, so
// +39 matched both "Italy +39" and "Vatican City +39" and nothing was chosen.
// The calling code's primary country dials the same number; NANP +1 stays ambiguous.
const fullList = ["United States +1", "Canada +1", "Guernsey +44", "Italy +39", "Jersey +44", "United Kingdom +44", "Vatican City +39"];
assert.equal(ask("Phone country code", ctx(), "react-select", fullList), "Italy +39");
assert.equal(ask("Phone country code", ctx({}, {}, { ...profile, phone: "+44 7700 900123" }), "react-select", fullList), "United Kingdom +44");
assert.equal(ask("Phone country code", ctx({}, {}, { ...profile, phone: "+1 415 555 0100", city: "" }), "react-select", fullList), null, "+1 needs a profile country");

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

// Label variants seen on 17 Nov forms (Recruitee: machinelearningreply).
for (const label of ["What is your preferred/possible start date?", "Preferred start date", "Possible starting date", "Earliest possible start date"]) {
  assert.equal(ask(label, ctx({}, { noticePeriod: "immediate" })), "Immediate", label);
  assert.equal(ask(label, ctx()), null, `${label}: nothing on file → manual`);
}
// Salary only from the candidate's own stated expectation (EUR), never invented.
const withSalary: FactContext = { facts: candidateFacts(profile, {}, { salaryExpectationEur: 40000 }, [], now) };
for (const label of ["What are your yearly salary expectations?", "Salary expectations", "Annual gross salary expectations (EUR)"]) {
  assert.equal(ask(label, withSalary), "40000", label);
  assert.equal(ask(label, ctx()), null, `${label}: no stated expectation → manual`);
}
assert.equal(ask("What are your salary expectations in USD?", withSalary), null, "other currency stays manual");
assert.equal(ask("What are your salary expectations (GBP)?", withSalary), null, "other currency stays manual");

// Optional WhatsApp/SMS/marketing opt-ins are declined; privacy/data consent never auto-answered.
assert.equal(ask("Do you opt-in to receive WhatsApp messages from Stripe Recruiting?*", ctx(), "react-select", ["Yes", "No"]), "No");
assert.equal(ask("Do you allow us to provide you TEXT/SMS updates of your interview process?*", ctx(), "select", ["Yes", "No"]), "No");
assert.equal(ask("I consent to the processing of my personal data and to receive marketing updates", ctx(), "select", ["Yes", "No"]), null, "privacy consent is never auto-answered");
assert.equal(ask("Do you agree to our privacy policy and to receive SMS updates?", ctx(), "select", ["Yes", "No"]), null);

// Still manual: C1 German, relocation, grades (no CV fact), country of work.
for (const label of ["Do you have at least a C1 level of German?", "Are you living in Munich or Berlin, or willing to relocate there?", "What is your highest qualification, and what grade did you achieve?"]) {
  assert.equal(ask(label, ctx({}, { noticePeriod: "immediate" })), null, label);
}

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

// Live 16–17 Nov labels: politeness prefixes, leading *, months, LinkedIn "link".
const maurizio = ctx({}, { yearsExperience: 20, englishLevel: "b1", noticePeriod: "immediate", euAuthorized: true });
assert.equal(ask("Please select the country where you currently reside. *", maurizio, "react-select", ["Australia", "Italy", "Germany", "UK", "US"]), "Italy");
assert.equal(ask("*LinkedIn Link", maurizio), "https://www.linkedin.com/in/giulia");
assert.equal(ask("*What is your current notice period?", maurizio), "Immediate");
assert.equal(ask("Please indicate your notice period in Months*", maurizio), "0");
assert.equal(ask("What is your level of English?", maurizio, "select", ["A1", "A2", "B1", "B2", "C1", "C2"]), "B1");
// CV "B1 - Livello intermedio" and User.englishLevel "b1" are the same fact, not a conflict.
const mixedEnglish: FactContext = {
  facts: candidateFacts(
    { ...profile, languages: [{ name: "Inglese", level: "B1 - Livello intermedio" }] },
    { englishLevel: "b1" }, {}, [], now,
  ),
};
assert.equal(ask("What is your level of English?", mixedEnglish, "select", ["A1", "A2", "B1", "B2"]), "B1");
// A bare www. LinkedIn URL from a CV is usable.
assert.equal(ask("*LinkedIn Link", ctx({}, {}, { ...profile, links: [{ label: "LinkedIn", url: "www.linkedin.com/in/giulia" }] })), "https://www.linkedin.com/in/giulia");
// Still manual: work-country preference, selected-location auth, salary, GDPR, "described roles".
for (const label of [
  "Please select the country or countries you anticipate working in for the role in which you are applying. *",
  "Are you authorized to work in the location(s) you selected in your previous response?*",
  "What are your salary expectations? *",
  "I hereby agree that I have received the notification to candidates acc. to Art. 13 GDPR.*",
  "Do you have at least 8 years of experience in the described roles?",
]) {
  assert.equal(ask(label, maurizio, "select", ["Yes", "No"]), null, label);
}


// Small Italian towns use "Comune (PR)" and are not in the major-city list;
// US profiles often use "City, ST ZIP". Both should still yield a country.
const smallTown = ctx({}, {}, { ...profile, city: "Carbognano (VT)" });
assert.equal(ask("Please select the country where you currently reside. *", smallTown, "react-select", ["Australia", "Italy", "Germany", "UK", "US"]), "Italy");
assert.equal(ask("Please select the country you are currently located in.*", smallTown, "react-select", ["Australia", "Italy", "Germany"]), "Italy");
const chietiTown = ctx({}, {}, { ...profile, city: "Montazzoli (CH)", phone: "+39 333 1234567" });
assert.equal(ask("Country of residence", chietiTown), "Italia", "Italian phone disambiguates (CH) as Chieti, not Switzerland");
assert.equal(ask("Country of residence", ctx({}, {}, { ...profile, city: "Davos Dorf (CH)", phone: "+41 81 123 45 67" })), null, "(CH) without an Italian phone stays manual");
const usCity = ctx({}, {}, { ...profile, city: "Jersey City, NJ 07302", phone: "+1 201 555 0100" });
assert.equal(ask("Country of residence", usCity), "Stati Uniti");
assert.equal(ask("Phone country code", usCity, "react-select", ["United States +1", "Canada +1", "Italy +39"]), "United States +1");

console.log("PASS profile-derived answers: phone code, residence, LinkedIn/portfolio, start date, EU right to work (job country only); EEO/salary/essays/sponsorship manual; answerable check aligned; live form-label variants.");
