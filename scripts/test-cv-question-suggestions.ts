import assert from "node:assert/strict";
import { suggestAnswerFromCv } from "../src/lib/cv-question-suggestions";
import type { CVProfile } from "../src/lib/cv-profile-types";

const cv: CVProfile = {
  firstName: "Umberto", lastName: "Geraci", email: "u@example.com", phone: "+39 123 456 7890", city: "Milano",
  title: "Software Engineer", summary: "", skills: [{ name: "React" }], languages: [{ name: "English", level: "C1" }], education: [],
  experiences: [{ role: "Engineer", company: "Current Co", location: "Milano", startDate: "2023", endDate: "", description: "", bullets: [] }],
  links: [{ label: "LinkedIn", url: "https://linkedin.com/in/example" }],
};

assert.equal(suggestAnswerFromCv("First name", "text", undefined, cv), "Umberto");
assert.equal(suggestAnswerFromCv("Current employer", "text", undefined, cv), "Current Co");
assert.equal(suggestAnswerFromCv("LinkedIn profile", "text", undefined, cv), "https://linkedin.com/in/example");
assert.equal(suggestAnswerFromCv("What is your first name?", "text", undefined, cv), "Umberto");
assert.equal(suggestAnswerFromCv("Do you have experience with React?", "select", ["Yes", "No"], cv), "Yes");
assert.equal(suggestAnswerFromCv("English level", "text", undefined, cv), "C1");
assert.equal(suggestAnswerFromCv("Do you have experience with Angular?", "select", ["Yes", "No"], cv), null);
assert.equal(suggestAnswerFromCv("How many years of professional experience do you have in the financial sector?", "text", undefined, cv, 7), null);
assert.equal(suggestAnswerFromCv("Are you authorized to work in the UK?", "select", ["Yes", "No"], cv), null);
assert.equal(suggestAnswerFromCv("Desired salary", "text", undefined, cv), null);
assert.equal(suggestAnswerFromCv("First name", "select", ["Another name"], cv), null);
assert.equal(suggestAnswerFromCv("Current employer", "text", undefined, { ...cv, experiences: [{ ...cv.experiences[0], endDate: "2024" }] }), null);
assert.equal(suggestAnswerFromCv("First name", "text", undefined, null), null);
