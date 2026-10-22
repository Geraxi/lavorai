import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applicationPrerequisiteBlock } from "../src/lib/application-prerequisites";

// Explicit confirmations must not create rows the worker can only hold forever.
const now = new Date();
assert.equal(applicationPrerequisiteBlock({ privacyConsentAt: now, emailVerified: now }), null);

const noPrivacy = applicationPrerequisiteBlock({ privacyConsentAt: null, emailVerified: now });
assert.equal(noPrivacy?.status, 409);
assert.equal(noPrivacy?.body.error, "privacy_consent_required");
assert.equal(noPrivacy?.body.redirect, "/settings#privacy-consent");

const neither = applicationPrerequisiteBlock({ privacyConsentAt: null, emailVerified: null });
assert.equal(neither?.body.error, "privacy_consent_required", "privacy is checked first, matching the worker gate order");

const noEmail = applicationPrerequisiteBlock({ privacyConsentAt: now, emailVerified: null });
assert.equal(noEmail?.body.error, "activation_incomplete");
assert.equal(noEmail?.body.issue, "verify_email");

// Every explicit creation/release route checks the prerequisites before writing.
for (const route of ["apply", "apply-batch", "consent"]) {
  const source = readFileSync(`src/app/api/applications/${route}/route.ts`, "utf8");
  const gate = source.indexOf("applicationPrerequisiteBlock(user)");
  assert.ok(gate > 0, `${route} checks prerequisites`);
  for (const write of ["createFreshApplication(", "prisma.application.create", "prisma.application.updateMany", "enqueueApplication("]) {
    const at = source.indexOf(write, source.indexOf("export async function POST"));
    if (at > 0) assert.ok(gate < at, `${route}: prerequisite gate precedes ${write}`);
  }
}

// Worker gate still enforces the same prerequisites (defence in depth).
const worker = readFileSync("src/lib/application-worker-gates.ts", "utf8");
assert.ok(worker.includes('if (!user.privacyConsentAt) return "privacy_consent_missing"'));
assert.ok(worker.includes('if (!user.emailVerified) return "email_verification_missing"'));

console.log("PASS application prerequisites: privacy consent and email verification are checked before explicit applications are created or released.");
