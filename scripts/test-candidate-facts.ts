import assert from "node:assert/strict";
import { candidateFacts, resolveCandidateFact, matchFactOption, employmentEnded, reusableFactKey } from "../src/lib/candidate-facts";
import { EMPTY_PROFILE } from "../src/lib/cv-profile-types";
const profile = { ...EMPTY_PROFILE, firstName: "Alex", lastName: "Example", city: "Milano", phone: "+44 7911 123456",
  experiences: [{ company: "Previous", role: "Engineer", startDate: "2018", endDate: "2024", location: "", description: "", bullets: [] }],
  education: [{ school: "University", degree: "Master", startDate: "2026", endDate: "In corso", location: "", notes: "" }] };
const facts = candidateFacts(profile, { yearsExperience: 5 }, { country: "Italy", salaryExpectationEur: 45000, workAuthEU: "yes_permit" });
const q = (label: string, kind = "text", options?: string[]) => ({ label, kind, options });
const yn = (label: string) => q(label, "select", ["Yes", "No"]);
for (const label of ["City", "Location (City)", "Where are you currently based?", "Dove risiedi?"]) assert.equal(resolveCandidateFact(q(label), { facts }).answer, "Milano");
assert.equal(resolveCandidateFact(q("Who is your current or previous employer?"), { facts }).answer, "Previous");
assert.equal(resolveCandidateFact(q("Current/previous employer"), { facts }).answer, "Previous");
assert.equal(resolveCandidateFact(q("Previous employer"), { facts }).answer, "Previous");
assert.equal(resolveCandidateFact(q("Current employer"), { facts }).answer, null);
assert.equal(resolveCandidateFact(q("Country of residence"), { facts }).answer, "Italy");
for (const label of ["Residence country", "Current country of residence", "In which country do you currently reside?", "Which country do you currently live in?"]) assert.equal(resolveCandidateFact(q(label), { facts }).answer, "Italy");
assert.equal(resolveCandidateFact(q("Current country of residence", "select", ["IT", "GB"]), { facts }).answer, "IT");
const date = new Date("2026-10-16T00:00:00Z");
for (const ended of ["2025", "2026-09", "2026-10-15"]) assert.equal(employmentEnded(ended, date), true, ended);
for (const unknown of ["", "Present", "2026", "2027", "2026-10", "2026-10-16", "2026-10-17", "2026-02-30", "2026-13", "2026-00", "01/02/2026", "around 2025"]) assert.equal(employmentEnded(unknown, date), false, unknown);
const recentPast = candidateFacts({ ...profile, experiences: [{ ...profile.experiences[0], endDate: "2026-09" }] }, {}, {}, [], date);
assert.equal(resolveCandidateFact(q("Previous employer name"), { facts: recentPast }).answer, "Previous");
assert.equal(resolveCandidateFact(q("Current employer"), { facts: recentPast }).answer, null);
const currentYearOnly = candidateFacts({ ...profile, experiences: [{ ...profile.experiences[0], endDate: "2026" }] }, {}, {}, [], date);
assert.equal(resolveCandidateFact(q("Previous employer"), { facts: currentYearOnly }).answer, null);
assert.equal(resolveCandidateFact(q("Phone country code", "select", ["Italy (+39)", "UK (+44)"]), { phone: "02079460000", country: "UK" }).answer, "UK (+44)", "national number falls back to profile country");
assert.equal(resolveCandidateFact(q("Country", "select", ["Italy (+39)", "United Kingdom (+44)"]), { facts }).answer, "United Kingdom (+44)");
assert.equal(resolveCandidateFact(q("Phone country code", "react-select", ["Italy (+39)", "United Kingdom (+44)"]), { facts }).answer, "United Kingdom (+44)");
assert.equal(matchFactOption(q("Phone country code", "select", ["USA (+1)", "Canada (+1)"]), "+1 212 555 1234"), null, "shared +1 without country stays ambiguous");
assert.equal(matchFactOption(q("Phone country code", "select", ["USA (+1)", "Canada (+1)"]), "+1 212 555 1234", "Canada"), "Canada (+1)");
assert.equal(resolveCandidateFact(q("Phone country code", "select", ["USA (+1)", "Canada (+1)"]), { phone: "+1 212 555 1234", country: "Canada" }).answer, "Canada (+1)");
assert.equal(resolveCandidateFact(q("Phone country code", "select", ["Italy (+39)", "UK (+44)"]), { phone: "+39 3791720976", country: "UK" }).answer, "Italy (+39)", "E.164 prefix wins over residence");
assert.equal(resolveCandidateFact(q("Phone country code", "select"), { phone: "+39 3791720976" }).answer, "Italy (+39)");
assert.equal(resolveCandidateFact(q("Phone country code", "select"), { phone: "+1 212 555 1234" }).answer, null, "shared +1 without country is not guessed");
assert.equal(resolveCandidateFact(q("Phone country code", "select"), { phone: "+1 212 555 1234", country: "Canada" }).answer, "Canada (+1)");
assert.equal(resolveCandidateFact(q("Why do you want this role?"), { phone: "+39 3791720976", country: "Italy" }).answer, null);
assert.equal(resolveCandidateFact(q("City", "select", []), { facts }).answer, null);
assert.equal(resolveCandidateFact(q("City", "react-select", ["Roma"]), { facts }, true).answer, "Milano", "Browser receives search value, never permission to select first option");
assert.equal(resolveCandidateFact(q("Expected annual salary (EUR)"), { facts }).answer, "45000");
assert.equal(resolveCandidateFact(q("WhatsApp opt-in"), { facts }).answer, "No");
assert.equal(resolveCandidateFact(q("May we contact you via WhatsApp?"), { facts }).answer, "No");
assert.equal(resolveCandidateFact(q("SMS marketing", "select", ["Yes", "No"]), { facts }).answer, "No");
assert.equal(resolveCandidateFact(q("Are you willing to work remotely?"), { facts }).answer, null);
assert.equal(resolveCandidateFact(q("Are you willing to work remotely?"), { facts, workRemote: true }).answer, "Yes");
assert.equal(resolveCandidateFact(yn("Have you worked for this company?"), { facts }).answer, null, "this company without an application employer goes to the user");
assert.equal(resolveCandidateFact(yn("Have you worked for this company?"), { facts, company: "Acme" }).answer, "No");
assert.equal(resolveCandidateFact(q("Have you worked for this company?"), { facts, company: "Acme" }).answer, null, "free-text employment question is never Yes/No");
assert.equal(resolveCandidateFact(q("Why do you want to work at this company?"), { facts, company: "Acme" }).answer, null);
assert.equal(resolveCandidateFact(q("What excites you about our company?"), { facts, company: "Acme" }).answer, null);
assert.equal(resolveCandidateFact(q("How did you hear about our company?"), { facts, company: "Acme" }).answer, null);
assert.equal(resolveCandidateFact(q("Do you know anyone who works at this company?"), { facts, company: "Acme" }).answer, null);
assert.equal(resolveCandidateFact(yn("Do you know anyone who works at this company?"), { facts, company: "Acme" }).answer, null);
assert.equal(resolveCandidateFact(yn("Have you worked at a startup before?"), { facts, company: "Acme" }).answer, null);
assert.equal(resolveCandidateFact(yn("Have you worked at an early-stage company?"), { facts, company: "Acme" }).answer, null);
assert.equal(resolveCandidateFact(yn("Have you worked at a fintech company?"), { facts, company: "Acme" }).answer, null);
assert.equal(resolveCandidateFact(yn("Have you worked at Google?"), { facts, company: "Acme" }).answer, null);
assert.equal(resolveCandidateFact(yn("Have you worked at Stripe?"), { facts }).answer, null);
assert.equal(resolveCandidateFact(yn("Have you previously been employed by Previous?"), { facts }).answer, null, "named other company is not this employer");
assert.equal(resolveCandidateFact(yn("Have you previously been employed by Previous?"), { facts, company: "Previous" }).answer, "Yes");
assert.equal(resolveCandidateFact(yn("Have you worked for this company?"), { facts, company: "Previous" }).answer, "Yes");
const exp = (company: string, endDate: string) => ({ company, role: "Engineer", startDate: "2018", endDate, location: "", description: "", bullets: [] });
const threeJobsAgo = candidateFacts({
  ...profile,
  experiences: [exp("NowCo", "Present"), exp("MidCo", "2024"), exp("BridgeCo", "2022"), exp("Ancient Ltd", "2019")],
}, {}, {}, [], date);
assert.equal(resolveCandidateFact(yn("Have you worked for this company?"), { facts: threeJobsAgo, company: "Ancient Ltd" }).answer, "Yes", "employer three jobs ago still counts");
assert.equal(resolveCandidateFact(yn("Have you previously been employed by Ancient?"), { facts: threeJobsAgo, company: "Ancient Ltd" }).answer, "Yes");
assert.equal(resolveCandidateFact(yn("Have you worked for this company?"), { facts: threeJobsAgo, company: "Stranger Inc" }).answer, "No");
const stripeFacts = candidateFacts({ ...profile, experiences: [exp("Stripe", "2022")] }, {}, {}, [], date);
assert.equal(resolveCandidateFact(yn("Have you previously worked for Stripe?"), { facts: stripeFacts, company: "Stripe" }).answer, "Yes");
assert.equal(resolveCandidateFact(yn("Have you ever been employed by Stripe or a Stripe affiliate?"), { facts: stripeFacts, company: "Stripe" }).answer, "Yes");
assert.equal(resolveCandidateFact(yn("Have you ever been employed by Stripe or any Stripe subsidiary?"), { facts: stripeFacts, company: "Stripe" }).answer, "Yes");
assert.equal(resolveCandidateFact(yn("Have you previously worked for Stripe?"), { facts, company: "Stripe" }).answer, "No");
assert.equal(resolveCandidateFact(yn("Have you ever been employed by Stripe or a Stripe affiliate?"), { facts: stripeFacts, company: "Acme" }).answer, null);
assert.equal(resolveCandidateFact(q("Have you previously worked for Stripe?"), { facts: stripeFacts, company: "Stripe" }).answer, null, "named employment on a free-text field stays unanswered");
assert.equal(resolveCandidateFact(q("Are you a public official?"), { facts }).answer, null);
assert.equal(resolveCandidateFact(q("Do you have family in public office?"), { facts }).answer, null);
assert.equal(resolveCandidateFact(q("Do you hold a master's degree?"), { facts }).answer, null);
assert.equal(resolveCandidateFact(q("Highest education"), { facts }).answer, null);
assert.equal(resolveCandidateFact(q("Are you authorized to work in Italy?"), { facts }).answer, null);
assert.equal(resolveCandidateFact(q("Are you authorized to work in the UK?"), { facts }).answer, null);
assert.equal(resolveCandidateFact(q("Do you require sponsorship in the US?"), { facts }).answer, null);
assert.equal(resolveCandidateFact(q("Are you an EU citizen?"), { facts }).answer, null);
assert.equal(resolveCandidateFact(q("Country where you want to work"), { facts }).answer, null);
assert.equal(resolveCandidateFact(q("Expected monthly salary (USD)"), { facts }).answer, null);
assert.equal(resolveCandidateFact(q("Years of Java experience"), { facts }).answer, null);
assert.equal(reusableFactKey("Are you authorized to work in Italy?"), "workAuthorization:italy");
assert.equal(reusableFactKey("Do you require sponsorship in the US?"), "sponsorship:united_states");
assert.equal(reusableFactKey("Are you a public official?"), "publicOfficial");
assert.equal(reusableFactKey("Why do you want to work at this company?"), null);
assert.equal(reusableFactKey("What excites you about our company?"), null);
assert.equal(reusableFactKey("How did you hear about our company?"), null);
assert.equal(reusableFactKey("Do you know anyone who works at this company?"), null);
assert.equal(reusableFactKey("Have you worked for this company?"), "previouslyEmployed");
const reusedAuth = candidateFacts(null, {}, {}, [{
  label: "Are you authorized to work in Italy?", kind: "select", answer: "Yes",
  source: "user", answeredAt: new Date(), optionsJson: '["Yes","No"]',
}]);
assert.equal(resolveCandidateFact(q("Are you authorized to work in Italy?", "select", ["Yes", "No"]), { facts: reusedAuth }).answer, "Yes");
assert.equal(resolveCandidateFact(q("Are you authorized to work in the UK?", "select", ["Yes", "No"]), { facts: reusedAuth }).answer, null);
const reusedOfficial = candidateFacts(null, {}, {}, [{
  label: "Are you a public official?", kind: "select", answer: "No",
  source: "user", answeredAt: new Date(), optionsJson: '["Yes","No"]',
}]);
assert.equal(resolveCandidateFact(q("Are you a public official?", "select", ["Yes", "No"]), { facts: reusedOfficial }).answer, "No");
const fromCity = candidateFacts({ ...EMPTY_PROFILE, city: "Milano, Italy" }, {}, {});
assert.equal(resolveCandidateFact(q("Country of residence"), { facts: fromCity }).answer, "Italia");
assert.equal(resolveCandidateFact(q("City", "checkbox"), { facts }).answer, null);
const conflicts = candidateFacts(profile, {}, { city: "Roma" });
const conflict = resolveCandidateFact(q("Location (City)"), { facts: conflicts });
assert.equal(conflict.answer, null); assert.equal(conflict.conflict, true); assert.deepEqual(conflict.provenance.map(f => f.source), ["cv", "preferences"]);
for (const source of ["ai", "assumed", "rule", "profile", "cv", "pending"]) {
  const saved = candidateFacts(null, {}, {}, [{ label: "City", kind: "text", answer: "Milano", source, answeredAt: new Date() }]);
  assert.equal(saved.length, 0, `Do not promote ${source}`);
}
const saved = (patch = {}) => candidateFacts(null, {}, {}, [{ label: "Where are you based?", kind: "select", answer: "Milano", source: "user", answeredAt: new Date(), optionsJson: '["Milano","Roma"]', ...patch }]);
assert.equal(resolveCandidateFact(q("Location (City)"), { facts: saved() }).answer, "Milano");
assert.equal(saved({ answeredAt: null }).length, 0);
assert.equal(saved({ optionsJson: '["Roma"]' }).length, 0);
assert.equal(resolveCandidateFact(q("WhatsApp opt-in"), { facts: saved({ label: "WhatsApp opt-in", kind: "select", answer: "Yes", optionsJson: '["Yes","No"]' }) }).answer, "Yes");
assert.equal(resolveCandidateFact(q("City"), { facts: [...saved(), ...saved({ answer: "Roma" })] }).conflict, true);
assert.equal(resolveCandidateFact(q("Full name"), { facts: candidateFacts(profile, {}, {}, [{ label: "First name", answer: "Bob", source: "user", answeredAt: new Date() }]) }).conflict, true);
assert.equal(resolveCandidateFact(q("Phone"), { facts: candidateFacts(profile, {}, {}, [{ label: "Phone", answer: "+447911123456", source: "user", answeredAt: new Date() }]) }).conflict, false);
console.log("PASS shared facts: CV/profile/preferences/verified user provenance, conflicts, employer/residence aliases, async search values, phone prefix, declarations and country-scope exclusions.");
