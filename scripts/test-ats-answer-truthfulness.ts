import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { questionFingerprint } from "../src/lib/application-question-answers";
import * as facts from "../src/lib/candidate-facts";
import * as safety from "../src/lib/portal-adapters/answer-safety";
import * as formLabels from "../src/lib/portal-adapters/form-labels";
import * as answerConstants from "../src/lib/application-answers";
import * as protectedCategory from "../src/lib/protected-category";

// Execute the real answerer with fake AI/browser boundaries; no service keys,
// employer sends, network, database or browser launches are used in this suite.
function load(name: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const text = readFileSync(`src/lib/portal-adapters/${name}.ts`, "utf8");
  const code = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} as any };
  vm.runInNewContext(code, {
    module, exports: module.exports, Date, URL,
    process: { env: { OPENAI_API_KEY: "isolated-test-only" } },
    console: { log() {}, warn() {}, error() {} },
    require: (id: string) => { assert.ok(id in dependencies, `Unexpected external dependency ${id}`); return dependencies[id]; },
    ...globals,
  });
  return module.exports;
}
const scopedAnswer = (label: string, answer: string, kind = "text", options: string[] = []) => ({
  label, answer, kind, options, fingerprint: questionFingerprint({ label, kind, options }),
});
let aiCalls = 0;
let lastPrompt = "";
const answerer = load("ai-answer", {
  "./answer-safety": safety, "../candidate-facts": facts, "./form-labels": formLabels,
  "@/lib/protected-category": protectedCategory,
  "@/lib/ai-router": { complete: async ({ user }: { user: string }) => {
    aiCalls++; lastPrompt = user;
    return { provider: "mock", text: JSON.stringify({ answers: [
      { idx: 90, value: "I have worked on the invoicing system described in my CV." },
      { idx: 0, value: "Yes" }, // fabricated illegal index must be ignored
      { idx: 91, value: { invalid: "object" } },
    ] }) };
  } },
});
const context = {
  autonomous: true, city: "Milano", country: "Italy", preferredCity: "Berlin",
  firstName: "Alex", lastName: "Example", email: "alex@example.test",
  yearsExperience: 7, salaryExpectationEur: 60_000,
  currentEmployer: null, mostRecentEmployer: "Past Employer",
  currentJobTitle: null, mostRecentJobTitle: "Engineer",
  cvText: "Engineer. Built an invoicing system at Past Employer.",
};
const factualLabels = [
  "Are you authorized to work in Italy?", "Are you authorized to work in the UK?",
  "Will you require sponsorship?", "Are you an EU citizen?", "Are you over 18?",
  "Have you been convicted of a crime?", "Do you hold security clearance?",
  "Do you have family working here?",
  "Do you hold a professional license?", "Are you bound by a non-compete?",
  "How many years of experience do you have with Python?", "Years of React experience",
  "Expected monthly salary (USD)", "Current annual salary (EUR)", "Expected salary",
  "Available to start", "Are you willing to relocate?", "Preferred work arrangement",
  "In which country are you authorized to work?", "Do you have a master's degree?",
  "Which country would you like to work in?", "I certify that I hold the required license",
  "I agree to the terms", "Unrecognized required question",
];
async function testUnknownFacts() {
  const fields = factualLabels.map((label, idx) => ({ idx, label, kind: "select", options: ["Yes", "No", "Other", "First real option"] }));
  const result = await answerer.answerOffline(context, fields);
  assert.equal(result.answers.size, 0, "Every unknown factual answer remains pending, even in autonomous mode");
  assert.equal(result.given.length, 0);
  const unknownEmployer = await answerer.answerOffline(context, [
    { idx: 80, label: "Have you previously worked for this company?", kind: "select", options: ["Yes", "No"] },
    { idx: 81, label: "Have you previously been employed by Past Employer?", kind: "select", options: ["Yes", "No"] },
    { idx: 82, label: "Have you worked at a startup before?", kind: "select", options: ["Yes", "No"] },
    { idx: 83, label: "Have you worked at Google?", kind: "select", options: ["Yes", "No"] },
  ]);
  assert.equal(unknownEmployer.answers.get(80), undefined, "this company without an application employer goes to the user");
  assert.equal(unknownEmployer.answers.get(81), undefined, "named other company is not auto-answered");
  assert.equal(unknownEmployer.answers.get(82), undefined, "startup category is not this employer");
  assert.equal(unknownEmployer.answers.get(83), undefined, "Google is not this employer");
  const thisEmployer = await answerer.answerOffline({ ...context, company: "Past Employer" }, [
    { idx: 80, label: "Have you previously worked for this company?", kind: "select", options: ["Yes", "No"] },
    { idx: 81, label: "Have you previously been employed by Past Employer?", kind: "select", options: ["Yes", "No"] },
  ]);
  assert.equal(thisEmployer.answers.get(80), "Yes", "this company matches work history");
  assert.equal(thisEmployer.answers.get(81), "Yes", "named this employer matches work history");
  const otherEmployer = await answerer.answerOffline({ ...context, company: "Acme" }, [
    { idx: 80, label: "Have you previously worked for this company?", kind: "select", options: ["Yes", "No"] },
    { idx: 81, label: "Have you previously been employed by Past Employer?", kind: "select", options: ["Yes", "No"] },
    { idx: 82, label: "Have you worked at a fintech company?", kind: "select", options: ["Yes", "No"] },
  ]);
  assert.equal(otherEmployer.answers.get(80), undefined, "incomplete history cannot prove no prior employment");
  assert.equal(otherEmployer.answers.get(81), undefined, "Past Employer is not Acme");
  assert.equal(otherEmployer.answers.get(82), undefined, "fintech category is not this employer");
  const acme = { ...context, company: "Acme" };
  assert.equal(facts.resolveCandidateFact({ label: "Why do you want to work at this company?", kind: "text" }, acme).answer, null);
  assert.equal(facts.resolveCandidateFact({ label: "What excites you about our company?", kind: "textarea" }, acme).answer, null);
  assert.equal(facts.resolveCandidateFact({ label: "How did you hear about our company?", kind: "text" }, acme).answer, null);
  assert.equal(facts.resolveCandidateFact({ label: "Do you know anyone who works at this company?", kind: "text" }, acme).answer, null);
  assert.equal(facts.resolveCandidateFact({ label: "Do you know anyone who works at this company?", kind: "select", options: ["Yes", "No"] }, acme).answer, null);
  assert.equal(facts.resolveCandidateFact({ label: "Have you previously worked for Stripe?", kind: "text" }, acme).answer, null);
  const stripeNamed = await answerer.answerOffline({ ...context, company: "Stripe", mostRecentEmployer: "Stripe", employers: ["Stripe"] }, [
    { idx: 76, label: "Have you previously worked for Stripe?", kind: "select", options: ["Yes", "No"] },
    { idx: 77, label: "Have you ever been employed by Stripe or a Stripe affiliate?", kind: "select", options: ["Yes", "No"] },
  ]);
  assert.equal(stripeNamed.answers.get(76), "Yes");
  assert.equal(stripeNamed.answers.get(77), "Yes");
  assert.equal(aiCalls, 0, "Factual screening questions never go to AI");
  const missing = await answerer.answerOffline({ autonomous: true }, [
    { idx: 50, label: "Expected annual salary (EUR)", kind: "text" },
    { idx: 51, label: "Country of residence", kind: "text" },
    { idx: 52, label: "Notice period", kind: "text" },
    { idx: 53, label: "I agree to the privacy policy", kind: "checkbox" },
  ]);
  assert.equal(missing.answers.size, 0, "No negotiable/N/A/default notice/residence/checkbox invention");
  const consented = await answerer.answerOffline({ ...context, privacyConsentAt: new Date("2026-01-01") }, [
    { idx: 53, label: "I agree to the privacy policy", kind: "checkbox" },
    { idx: 54, label: "I agree to the terms", kind: "checkbox" },
  ]);
  assert.equal(consented.answers.get(53), undefined, "Platform consent does not accept employer privacy terms");
  assert.equal(consented.answers.get(54), undefined, "Terms stay a question");
  console.log("Unknown eligibility, history, qualifications, salary, availability and consent stay unanswered.");
}
async function testActualFactsAndUserAnswers() {
  const result = await answerer.answerOffline({ ...context, storedAnswers: [
    scopedAnswer(factualLabels[0], "Yes", "select", ["Yes", "No"]),
    scopedAnswer("I agree to the privacy policy", "Yes", "checkbox"),
  ] }, [
    { idx: 0, label: factualLabels[0], kind: "select", options: ["Yes", "No"] },
    { idx: 1, label: "Years of experience", kind: "text" },
    { idx: 2, label: "Expected annual salary (EUR)", kind: "text" },
    { idx: 3, label: "Current employer", kind: "text" },
    { idx: 4, label: "Current or previous employer", kind: "text" },
    { idx: 5, label: "City of residence", kind: "text" },
    { idx: 6, label: "Country of residence", kind: "text" },
    { idx: 7, label: "I agree to the privacy policy", kind: "checkbox" },
    { idx: 8, label: "Full name", kind: "text" },
  ]);
  assert.equal(result.answers.get(0), "Yes");
  assert.equal(result.answers.get(1), "7");
  assert.equal(result.answers.get(2), "60000");
  assert.equal(result.answers.get(3), undefined, "A past employer is not a current employer");
  assert.equal(result.answers.get(4), "Past Employer");
  assert.equal(result.answers.get(5), "Milano");
  assert.equal(result.answers.get(6), "Italy");
  assert.equal(result.answers.get(7), "Yes");
  assert.equal(result.answers.get(8), "Alex Example");
  const ambiguous = await answerer.answerOffline({ storedAnswers: [scopedAnswer("Example?", "No", "select", ["Not now", "Not eligible", "No preference"])] }, [
    { idx: 0, label: "Example?", kind: "select", options: ["Not now", "Not eligible", "No preference"] },
  ]);
  assert.equal(ambiguous.answers.size, 0, "No must not fuzzy-match No preference or Not eligible");
  console.log("Exact user answers and actual profile facts are reused without transferring their meaning.");
}
async function testScopedAnswers() {
  const field = { idx: 0, label: "I certify that I hold the required license", kind: "checkbox" };
  const saved = scopedAnswer(field.label, "Yes", field.kind);
  for (const invalid of [
    { label: field.label, answer: "Yes" },
    { ...saved, fingerprint: undefined },
    { ...saved, fingerprint: "wrong" },
    scopedAnswer(field.label.toLowerCase(), "Yes", field.kind),
    scopedAnswer(field.label, "Yes", "radio", ["Yes", "No"]),
    scopedAnswer(field.label, "Yes", field.kind, ["A changed disclosure"]),
    { ...saved, label: "A different declaration" },
  ]) {
    const result = await answerer.answerOffline({ storedAnswers: [invalid] }, [field]);
    assert.equal(result.answers.size, 0, JSON.stringify(invalid));
  }
  const protectedDeclaration = await answerer.answerOffline({ protectedCategory: true }, [{ idx: 4, label: "Dichiaro di appartenere alle categorie protette", kind: "checkbox" }]);
  assert.equal(protectedDeclaration.answers.size, 0, "A profile fact is not permission to make an application-specific declaration");
  const membership = { idx: 5, label: "Appartieni alle categorie protette?", kind: "radio", options: ["Yes", "No"] };
  for (const searchPreference of [false, true]) {
    const unavailable = await answerer.answerOffline({ protectedCategory: searchPreference }, [membership]);
    assert.equal(unavailable.answers.size, 0, `Search preference ${searchPreference} must not disclose membership`);
    const browserUnanswered = await answerer.answerRequiredFields({ evaluate: async () => [membership] }, { protectedCategory: searchPreference });
    assert.equal(browserUnanswered.answered, 0); assert.equal(browserUnanswered.remainingRequired, 1);
  }
  const explicitMembership = await answerer.answerOffline({ protectedCategory: false, storedAnswers: [scopedAnswer(membership.label, "Yes", "radio", ["Yes", "No"])] }, [membership]);
  assert.equal(explicitMembership.answers.get(5), "Yes", "Only the scoped explicit membership answer controls disclosure");
  const explicit = await answerer.answerOffline({ storedAnswers: [saved] }, [field]);
  assert.equal(explicit.answers.get(0), "Yes");
  const booleanField = { idx: 2, label: "Do you need visa sponsorship?", kind: "radio", options: ["Yes", "No"] };
  const explicitNo = await answerer.answerOffline({ storedAnswers: [scopedAnswer(booleanField.label, "No", "radio", ["Yes", "No"])] }, [booleanField]);
  assert.equal(explicitNo.answers.get(2), "No", "A scoped No is valid for a boolean choice, distinct from accepting a required consent checkbox");
  const optionField = { idx: 1, label: "Are you authorized to work here?", kind: "select", options: ["Yes", "No"] };
  const previousOptions = scopedAnswer(optionField.label, "Yes", "select", ["Yes", "No", "Other"]);
  assert.equal((await answerer.answerOffline({ storedAnswers: [previousOptions] }, [optionField])).answers.size, 0);
  const mismatchedOptions = scopedAnswer(optionField.label, "Yes", "select", ["No", "Yes"]);
  assert.equal((await answerer.answerOffline({ storedAnswers: [mismatchedOptions] }, [optionField])).answers.size, 0);
  assert.equal((await answerer.answerOffline({ storedAnswers: [saved, { ...saved, answer: "No" }] }, [field])).answers.size, 0, "Conflicting answers are ambiguous");
  const city = { idx: 6, label: "City", kind: "text" };
  const conflictingCity = { city: "Milano", storedAnswers: [scopedAnswer("City", "Roma"), scopedAnswer("City", "Milano")] };
  assert.equal((await answerer.answerOffline(conflictingCity, [city])).answers.size, 0, "A factual source cannot bypass conflicting explicit answers");
  const conflictingBrowser = await answerer.answerRequiredFields({ evaluate: async () => [city] }, conflictingCity);
  assert.equal(conflictingBrowser.answered, 0); assert.equal(conflictingBrowser.remainingRequired, 1);
  let checked = false;
  const page = {
    evaluate: async () => checked ? [] : [field],
    locator: () => ({ first: () => ({ check: async () => { checked = true; }, isChecked: async () => checked }) }),
  };
  const legacy = await answerer.answerRequiredFields(page, { storedAnswers: [{ label: field.label, answer: "Yes", kind: "checkbox" }] });
  assert.equal(checked, false); assert.equal(legacy.remainingRequired, 1);
  const current = await answerer.answerRequiredFields(page, { storedAnswers: [saved] });
  assert.equal(checked, true); assert.equal(current.remainingRequired, 0);
  console.log("Stored answers require exact application-scoped label/kind/ordered-option fingerprints; global declarations never check a box.");
}

async function testNarrativeOnlyAi() {
  const result = await answerer.answerOffline(context, [
    { idx: 0, label: "Are you authorized to work in the UK?", kind: "select", options: ["Yes", "No"] },
    { idx: 90, label: "Tell us about yourself", kind: "textarea" },
    { idx: 91, label: "Why this role?", kind: "textarea" },
  ]);
  assert.equal(aiCalls, 1);
  assert.ok(!lastPrompt.includes("Are you authorized to work in the UK"));
  assert.ok(lastPrompt.includes(context.cvText));
  assert.equal(result.answers.get(0), undefined, "Unexpected factual answer from the model must be discarded");
  assert.ok(result.answers.get(90)?.includes("invoicing system"));
  assert.equal(result.answers.get(91), undefined, "Malformed model values must not fill a field");
  const missingCv = await answerer.answerOffline({ autonomous: true }, [{ idx: 90, label: "Tell us about yourself", kind: "textarea" }]);
  assert.equal(missingCv.answers.size, 0);
  assert.equal(aiCalls, 1, "No CV means no invented narrative");
}
async function testBrowserAnswering() {
  const unknownFields = factualLabels.map((label, idx) => ({ idx, label, kind: "text" }));
  const unknown = await answerer.answerRequiredFields({ evaluate: async () => unknownFields }, context);
  assert.equal(unknown.answered, 0); assert.equal(unknown.remainingRequired, factualLabels.length);
  assert.equal(unknown.unanswered.length, factualLabels.length);
  const failedScan = await answerer.answerRequiredFields({ evaluate: async () => { throw Error("Unreadable page"); } }, context);
  assert.equal(failedScan.remainingRequired, 1);
  assert.equal(failedScan.unanswered.length, 1, "Failed scan must block rather than invent zero required questions");
  let filled: string | null = null;
  const decimalPage = {
    evaluate: async () => filled === null ? [{ idx: 0, label: "Years of experience", kind: "text", inputType: "number" }] : [],
    locator: () => ({ first: () => ({ fill: async (value: string) => { filled = value; } }) }),
  };
  const decimal = await answerer.answerRequiredFields(decimalPage, { yearsExperience: 3.5 });
  assert.equal(filled, "3.5"); assert.equal(decimal.answered, 1);
  console.log("Browser handler blocks unknown/scan failures and preserves fractional numeric facts.");
}
async function testAsyncOptions() {
  for (const optionsEventuallyMatch of [true, false]) {
    let selected = "", typed = "", polls = 0;
    const field = { idx: 0, label: "Location (City)", kind: "react-select", options: [] };
    const locator = {
      click: async () => {}, fill: async (value: string) => { typed = value; },
      getAttribute: async () => "city-list", evaluate: async () => selected === "Milano",
    };
    const page = {
      evaluate: async () => selected ? [] : [field], keyboard: { press: async () => {} }, waitForTimeout: async () => {},
      locator: (selector: string) => selector.includes("role='option'") ? {
        allTextContents: async () => { polls++; return optionsEventuallyMatch && polls >= 4 ? ["Roma", "Milano"] : ["Roma"]; },
        nth: (index: number) => ({ click: async () => { assert.equal(index, 1); selected = "Milano"; } }),
      } : { first: () => locator },
    };
    const result = await answerer.answerRequiredFields(page, { city: "Milano" });
    assert.equal(typed, "Milano"); assert.ok(polls >= 4);
    assert.equal(result.answered, optionsEventuallyMatch ? 1 : 0);
    assert.equal(result.remainingRequired, optionsEventuallyMatch ? 0 : 1);
  }
  console.log("Async widgets wait for the exact current option; unrelated/stale options never get selected.");
}
function testGenericAndContext() {
  const generic = load("generic-fill", { "./answer-safety": safety, "../candidate-facts": facts, "@/lib/application-answers": answerConstants });
  for (const label of ["Work authorization in the USA", "Visa sponsorship", "EU citizen", "Authorized to work", "Expected monthly salary (USD)", "Current salary", "Country where you want to work", "How many years of Python experience?"]) {
    assert.equal(generic.matchAnswerKey(label), null, label);
  }
  assert.equal(generic.matchAnswerKey("Appartieni alle categorie protette?"), null);
  assert.equal(generic.matchAnswerKey("Disability status"), "eeoDisability", "Explicit separately supplied EEO answers remain supported");
  assert.equal(generic.matchAnswerKey("Country of residence | country"), null, "Never discard a qualifier after a separator");
  assert.equal(generic.matchAnswerKey("Expected annual salary (EUR)"), "salaryExpectationEur");
  const web = load("web-form", {
    "../candidate-facts": facts, "./submission-proof": {}, "./captcha": {}, "./ai-answer": answerer,
    "./page-guards": { inspectLivePage: async () => null, abortIfFieldsWrong: async () => null },
    "./stuck-page": { PageProgressTracker: class { note() { return "progress"; } } },
  });
  const input = { profile: { experiences: [{ company: "Old", role: "Designer", endDate: "2020" }], links: [], education: [] }, preferredCity: "Berlin", userEmail: "alex@example.test" };
  const built = web.buildAnswerContext(input);
  assert.equal(built.city, null, "Desired location is not present residence");
  assert.equal(built.currentEmployer, null);
  assert.equal(built.mostRecentEmployer, "Old");
  assert.equal(built.currentJobTitle, null);
}
async function main() {
  await testUnknownFacts(); await testActualFactsAndUserAnswers(); await testScopedAnswers(); await testNarrativeOnlyAi(); await testBrowserAnswering(); await testAsyncOptions(); testGenericAndContext();
  console.log("ATS factual-answer regression suite passed with fully isolated AI/browser boundaries.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
