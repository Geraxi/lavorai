import assert from "node:assert/strict";
import { candidateFacts, resolveCandidateFact, matchFactOption } from "../src/lib/candidate-facts";
import { EMPTY_PROFILE } from "../src/lib/cv-profile-types";
const profile = { ...EMPTY_PROFILE, firstName: "Alex", lastName: "Example", city: "Milano", phone: "+44 7911 123456",
  experiences: [{ company: "Previous", role: "Engineer", startDate: "2018", endDate: "2024", location: "", description: "", bullets: [] }],
  education: [{ school: "University", degree: "Master", startDate: "2026", endDate: "In corso", location: "", notes: "" }] };
const facts = candidateFacts(profile, { yearsExperience: 5 }, { country: "Italy", salaryExpectationEur: 45000, workAuthEU: "yes_permit" });
const q = (label: string, kind = "text", options?: string[]) => ({ label, kind, options });
for (const label of ["City", "Location (City)", "Where are you currently based?", "Dove risiedi?"]) assert.equal(resolveCandidateFact(q(label), { facts }).answer, "Milano");
assert.equal(resolveCandidateFact(q("Who is your current or previous employer?"), { facts }).answer, "Previous");
assert.equal(resolveCandidateFact(q("Current/previous employer"), { facts }).answer, "Previous");
assert.equal(resolveCandidateFact(q("Previous employer"), { facts }).answer, "Previous");
assert.equal(resolveCandidateFact(q("Current employer"), { facts }).answer, null);
assert.equal(resolveCandidateFact(q("Country of residence"), { facts }).answer, "Italy");
assert.equal(resolveCandidateFact(q("Country", "select", ["Italy (+39)", "United Kingdom (+44)"]), { facts }).answer, "United Kingdom (+44)");
assert.equal(resolveCandidateFact(q("Phone country code", "react-select", ["Italy (+39)", "United Kingdom (+44)"]), { facts }).answer, "United Kingdom (+44)");
assert.equal(matchFactOption(q("Phone country code", "select", ["USA (+1)", "Canada (+1)"]), "+1 212 555 1234"), null);
assert.equal(resolveCandidateFact(q("City", "select", []), { facts }).answer, null);
assert.equal(resolveCandidateFact(q("City", "react-select", ["Roma"]), { facts }, true).answer, "Milano", "Browser receives search value, never permission to select first option");
assert.equal(resolveCandidateFact(q("Expected annual salary (EUR)"), { facts }).answer, "45000");
for (const label of ["WhatsApp opt-in", "May we contact you via WhatsApp?", "Are you a public official?", "Do you have family in public office?", "Have you worked for this company?", "Have you worked at Stripe?", "Do you hold a master's degree?", "Highest education", "Are you authorized to work in Italy?", "Are you authorized to work in the UK?", "Do you require sponsorship in the US?", "Are you an EU citizen?", "Country where you want to work", "Expected monthly salary (USD)", "Years of Java experience"]) assert.equal(resolveCandidateFact(q(label), { facts }).answer, null, label);
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
assert.equal(saved({ label: "WhatsApp opt-in" }).length, 0);
assert.equal(resolveCandidateFact(q("City"), { facts: [...saved(), ...saved({ answer: "Roma" })] }).conflict, true);
assert.equal(resolveCandidateFact(q("Full name"), { facts: candidateFacts(profile, {}, {}, [{ label: "First name", answer: "Bob", source: "user", answeredAt: new Date() }]) }).conflict, true);
assert.equal(resolveCandidateFact(q("Phone"), { facts: candidateFacts(profile, {}, {}, [{ label: "Phone", answer: "+447911123456", source: "user", answeredAt: new Date() }]) }).conflict, false);
console.log("PASS shared facts: CV/profile/preferences/verified user provenance, conflicts, employer/residence aliases, async search values, phone prefix, declarations and country-scope exclusions.");
