import assert from "node:assert/strict";
import { displayOption, displayQuestion } from "../src/lib/question-display-language";

assert.deepEqual(displayQuestion("How many years of professional experience do you have in the financial sector?", "it"), {
  text: "Quanti anni di esperienza professionale hai nel settore finanziario?", translated: true,
});
assert.equal(displayQuestion("Are you authorized to work in the UK?", "it").text, "Hai il diritto di lavorare nel Regno Unito?");
assert.equal(displayQuestion("Do you have experience with React?", "it").text, "Hai esperienza con React?");
assert.equal(displayQuestion("Custom employer question", "it").text, "Custom employer question");
assert.equal(displayQuestion("First name", "en").text, "First name");
assert.equal(displayOption("Yes", "it"), "Sì");
assert.equal(displayOption("Yes", "en"), "Yes");
