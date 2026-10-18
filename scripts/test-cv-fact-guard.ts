import assert from "node:assert/strict";
import { checkCvFacts, repairCvFacts, traceability, yearsIn } from "../src/lib/cv-fact-guard";
import { diffCvText } from "../src/lib/cv-diff";
import type { OptimizedCVData } from "../src/types/cv";

const source = `Mario Rossi
Product Designer
ACME S.r.l. — Milano | 03/2019 – Present
- Designed onboarding flows for 150+ clients
Studio Bianchi & Associati | 2016 - 2019
- UI design for retail
Education
Politecnico di Milano — Laurea Magistrale in Design della Comunicazione, 2014 - 2016`;

function cv(overrides: Partial<OptimizedCVData> = {}): OptimizedCVData {
  return {
    fullName: "Mario Rossi",
    email: "",
    phone: "Disponibile su richiesta",
    location: "Milano, Italia",
    linkedinUrl: null,
    summary: "Product designer.",
    experiences: [
      { role: "Product Designer", company: "ACME S.r.l.", location: "Milano", startDate: "03/2019", endDate: "Presente", bullets: ["Progettato flussi di onboarding per 150+ clienti"] },
      { role: "UI Designer", company: "Studio Bianchi & Associati", location: "", startDate: "2016", endDate: "2019", bullets: ["UI design per il retail"] },
    ],
    education: [
      { degree: "Laurea Magistrale in Design della Comunicazione", institution: "Politecnico di Milano", location: "Milano", startDate: "2014", endDate: "2016", notes: null },
    ],
    skills: { technical: [], soft: [], tools: [] },
    languages: [],
    ...overrides,
  };
}

// Traceability basics
assert.equal(traceability("ACME S.r.l.", source), 1);
assert.equal(traceability("Google", source), 0);
assert.deepEqual(yearsIn("03/2019 – 2021"), ["2019", "2021"]);

// A faithful CV passes untouched.
const faithful = checkCvFacts(source, cv());
assert.equal(faithful.ok, true, JSON.stringify(faithful.issues));
assert.equal(faithful.issues.length, 0);

// Invented employer is removed, real ones kept.
const invented = cv({
  experiences: [
    ...cv().experiences,
    { role: "Lead Designer", company: "Google", location: "Zurich", startDate: "2021", endDate: "2023", bullets: ["Led design"] },
  ],
});
const check = checkCvFacts(source, invented);
assert.equal(check.ok, false);
assert.ok(check.issues.some((issue) => issue.kind === "employer_not_in_source" && issue.value === "Google"));
const repaired = repairCvFacts(source, invented);
assert.equal(repaired.cv.experiences.length, 2);
assert.ok(repaired.cv.experiences.every((experience) => experience.company !== "Google"));
// The original object is not mutated.
assert.equal(invented.experiences.length, 3);

// Shifted dates are cleared, never replaced.
const shifted = repairCvFacts(source, cv({
  experiences: [{ ...cv().experiences[0], startDate: "01/2017" }, cv().experiences[1]],
}));
assert.equal(shifted.result.ok, false);
assert.equal(shifted.cv.experiences[0].startDate, "");
assert.equal(shifted.cv.experiences[0].endDate, "Presente");

// Invented degree + institution removed; translated institution only flagged.
const edu = repairCvFacts(source, cv({
  education: [
    cv().education[0],
    { degree: "MBA", institution: "Harvard Business School", location: "", startDate: "", endDate: "", notes: null },
  ],
}));
assert.equal(edu.cv.education.length, 1);
const translated = checkCvFacts(source, cv({
  education: [{ ...cv().education[0], institution: "Milan Polytechnic University" }],
}));
assert.ok(translated.issues.some((issue) => issue.kind === "institution_partial_match"));
assert.equal(translated.ok, true);

// User-written session context counts as a source.
const withContext = checkCvFacts(`${source}\nFreelance per Lavazza 2023`, cv({
  experiences: [...cv().experiences, { role: "Freelance", company: "Lavazza", location: "", startDate: "2023", endDate: "2023", bullets: [] }],
}));
assert.equal(withContext.ok, true);

// Diff: unchanged lines are "same", rewritten lines show as removed + added.
const diff = diffCvText("Mario Rossi\nACME S.r.l.\n- UI design for retail", "Mario Rossi\nACME S.r.l.\n• UI design per il retail e l'e-commerce");
assert.deepEqual(diff.summary, { added: 1, removed: 1, same: 2 });
assert.equal(diff.lines[0].op, "same");
const bulletOnly = diffCvText("- Designed flows", "• Designed flows");
assert.deepEqual(bulletOnly.summary, { added: 0, removed: 0, same: 1 });

console.log("cv fact guard + diff: ok");
