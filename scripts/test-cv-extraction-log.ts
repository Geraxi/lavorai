import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import {
  classifyCvError,
  cvFieldPresence,
  hashUserRef,
  logCvExtraction,
  logCvExtractionFailure,
  sanitizeCvError,
} from "../src/lib/cv-extraction-log";

const SAMPLE_USER_ID = "user_cv_pii_test_001";
const SAMPLE_NAME = "Giulia Bianchi";
const SAMPLE_EMAIL = "giulia.bianchi@example-corp.it";
const SAMPLE_PHONE = "+39 347 1122334";
const SAMPLE_ADDRESS = "Via Torino 45, 20123 Milano";
const SAMPLE_PHRASE = "progettato il checkout mobile per 2 milioni di utenti";

const SAMPLE_CV = `${SAMPLE_NAME}
Product Designer
${SAMPLE_EMAIL} · ${SAMPLE_PHONE}
${SAMPLE_ADDRESS}

Esperienza
Lead Product Designer — Acme Retail (2021 – presente)
- ${SAMPLE_PHRASE}
- Coordinato un team di 6 designer su iOS e Android

Education
Politecnico di Milano — Laurea Magistrale in Design, 2016 – 2018`;

const PII_TOKENS = [
  SAMPLE_USER_ID,
  SAMPLE_NAME,
  "Giulia",
  "Bianchi",
  SAMPLE_EMAIL,
  SAMPLE_PHONE,
  "347 1122334",
  SAMPLE_ADDRESS,
  "Via Torino",
  SAMPLE_PHRASE,
  SAMPLE_CV,
];

function captureLogs(fn: () => void): string {
  const chunks: string[] = [];
  const sink = (...args: unknown[]) => {
    chunks.push(
      args
        .map((arg) => {
          if (typeof arg === "string") return arg;
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        })
        .join(" "),
    );
  };
  const orig = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
  };
  console.log = sink;
  console.warn = sink;
  console.error = sink;
  console.info = sink;
  console.debug = sink;
  try {
    fn();
  } finally {
    console.log = orig.log;
    console.warn = orig.warn;
    console.error = orig.error;
    console.info = orig.info;
    console.debug = orig.debug;
  }
  return chunks.join("\n");
}

function assertNoPii(logged: string, label: string): void {
  for (const token of PII_TOKENS) {
    assert.ok(
      !logged.includes(token),
      `${label}: logged output leaked ${JSON.stringify(token)}\n---\n${logged}\n---`,
    );
  }
}

const hashed = hashUserRef(SAMPLE_USER_ID);
assert.equal(hashed, createHash("sha256").update(SAMPLE_USER_ID).digest("hex").slice(0, 12));
assert.equal(hashed?.length, 12);
assert.notEqual(hashed, SAMPLE_USER_ID);
assert.equal(hashUserRef(""), undefined);
assert.equal(hashUserRef(undefined), undefined);

const parsed = {
  firstName: "Giulia",
  lastName: "Bianchi",
  email: SAMPLE_EMAIL,
  phone: SAMPLE_PHONE,
  city: "Milano",
  title: "Product Designer",
  summary: SAMPLE_PHRASE,
  experiences: [{ role: "Lead Product Designer", company: "Acme Retail" }],
  education: [{ school: "Politecnico di Milano" }],
  skills: [{ name: "Figma" }],
  languages: [{ name: "Italiano" }],
  links: [],
};
const presence = cvFieldPresence(parsed);
assert.equal(presence.firstName, true);
assert.equal(presence.email, true);
assert.equal(presence.phone, true);
assert.equal(presence.city, true);
assert.equal(presence.summary, true);
assert.equal(presence.experiences, true);
assert.equal(presence.links, false);
assert.ok(Object.values(presence).every((value) => typeof value === "boolean"));
assert.ok(!JSON.stringify(presence).includes("Giulia"));
assert.ok(!JSON.stringify(presence).includes(SAMPLE_EMAIL));
assert.ok(!JSON.stringify(presence).includes(SAMPLE_PHONE));

const piiError = new Error(`[cv-profile-ai] RAW RESPONSE: ${SAMPLE_CV}`);
(piiError as { status?: number }).status = 429;
assert.equal(classifyCvError(piiError), "RateLimitError");
const sanitized = sanitizeCvError(piiError);
assert.equal(sanitized.errorClass, "RateLimitError");
assert.equal(sanitized.status, 429);
assert.ok(!("message" in sanitized));
assert.ok(!JSON.stringify(sanitized).includes(SAMPLE_EMAIL));
assert.ok(!JSON.stringify(sanitized).includes(SAMPLE_NAME));

const successLog = captureLogs(() => {
  logCvExtraction({
    tag: "cv-profile-ai",
    model: "gpt-test",
    provider: "openai",
    latencyMs: 42,
    inputTokens: 1200,
    outputTokens: 180,
    parseOk: true,
    fields: presence,
    userRef: hashUserRef(SAMPLE_USER_ID),
  });
});
assertNoPii(successLog, "success diagnostic");
assert.match(successLog, /cv-profile-ai/);
assert.match(successLog, /"model":"gpt-test"/);
assert.match(successLog, /"provider":"openai"/);
assert.match(successLog, /"latencyMs":42/);
assert.match(successLog, /"inputTokens":1200/);
assert.match(successLog, /"outputTokens":180/);
assert.match(successLog, /"parseOk":true/);
assert.match(successLog, new RegExp(`"userRef":"${hashed}"`));
assert.match(successLog, /"firstName":true/);
assert.match(successLog, /"email":true/);

const failureLog = captureLogs(() => {
  logCvExtractionFailure("cv-profile-ai", piiError, { userRef: hashUserRef(SAMPLE_USER_ID) });
  logCvExtractionFailure("cv-profile-ai-full", new Error(`Schema mismatch for ${SAMPLE_EMAIL}`));
  logCvExtractionFailure("parseCV", new Error(`mammoth failed on ${SAMPLE_CV}`));
  logCvExtractionFailure("onboarding-cv", { status: 401, message: SAMPLE_CV, body: SAMPLE_CV });
  logCvExtractionFailure("adoptStagedCv", SAMPLE_CV, { userRef: hashUserRef(SAMPLE_USER_ID) });
});
assertNoPii(failureLog, "failure diagnostic");
assert.match(failureLog, /"parseOk":false/);
assert.match(failureLog, /"errorClass":"RateLimitError"/);
assert.match(failureLog, /"status":429/);
assert.match(failureLog, /"errorClass":"AuthError"/);
assert.match(failureLog, /"errorClass":"ParseLibraryError"/);

const sources = [
  "src/lib/cv-profile-ai.ts",
  "src/lib/cv-profile-ai-full.ts",
  "src/lib/cv-parser.ts",
  "src/lib/cv-profile-ensure.ts",
  "src/lib/ai-router.ts",
  "src/app/api/onboarding/cv/route.ts",
  "src/lib/auth.ts",
];
for (const rel of sources) {
  const src = readFileSync(resolve(rel), "utf8");
  assert.ok(!src.includes("RAW RESPONSE"), `${rel} still logs RAW RESPONSE`);
  assert.ok(
    !/console\.(log|error|warn)\([^)]*raw/i.test(src),
    `${rel} still logs a raw body`,
  );
}

const aiSrc = readFileSync(resolve("src/lib/cv-profile-ai.ts"), "utf8");
assert.match(aiSrc, /logCvExtraction\(/);
assert.match(aiSrc, /logCvExtractionFailure\(/);
assert.ok(!aiSrc.includes("console.log("));

console.log("PASS cv extraction logs keep diagnostics and never emit sample-CV PII");
