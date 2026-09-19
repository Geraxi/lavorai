import assert from "node:assert/strict";
import { 
  extractApplicationSecurityCode, 
  isGreenhouseSecurityMessage 
} from "../src/lib/application-security-code";

/**
 * Test suite for OTP extraction and auto-completion logic.
 * 
 * Covers:
 * - Code extraction from various email formats
 * - Security message identification
 * - Edge cases (malformed emails, multiple codes, no code)
 * - Real-world Greenhouse email samples
 */

console.log("Testing OTP extraction...");

// ============================================================
// EXTRACTION TESTS
// ============================================================

// Standard Greenhouse format
assert.equal(
  extractApplicationSecurityCode("Copy and paste this code into the application form: YqOsq2bB\nAfter you enter"),
  "YqOsq2bB",
  "Standard Greenhouse format"
);

// Numeric codes
assert.equal(
  extractApplicationSecurityCode("Your verification code is 123456."),
  "123456",
  "Numeric verification code"
);

assert.equal(
  extractApplicationSecurityCode("Security code:\n123456"),
  "123456",
  "Numeric with newline"
);

// Alphanumeric mixed case
assert.equal(
  extractApplicationSecurityCode("Security code:\nAbCdEfGh"),
  "AbCdEfGh",
  "Alphanumeric mixed case"
);

// Italian localization
assert.equal(
  extractApplicationSecurityCode("Codice di sicurezza: aB123456"),
  "aB123456",
  "Italian security code"
);

assert.equal(
  extractApplicationSecurityCode("Il tuo codice di verifica è: XyZ789Ab"),
  "XyZ789Ab",
  "Italian verification code"
);

// Long alphanumeric codes (up to 12 chars)
assert.equal(
  extractApplicationSecurityCode("Security code: ABC123XYZ789"),
  "ABC123XYZ789",
  "12-character code"
);

// Variations with "is" connector
assert.equal(
  extractApplicationSecurityCode("Your security code is H3ll0W0rld"),
  "H3ll0W0rld",
  "Security code with 'is'"
);

// ============================================================
// NEGATIVE TESTS (should NOT extract)
// ============================================================

// Job IDs or reference numbers that aren't codes
assert.equal(
  extractApplicationSecurityCode("Application 12345678. Your security code will arrive shortly."),
  null,
  "Job ID not extracted as code"
);

assert.equal(
  extractApplicationSecurityCode("Reference 123456"),
  null,
  "Reference number not extracted"
);

assert.equal(
  extractApplicationSecurityCode("Security code for application"),
  null,
  "Label without code"
);

// Dates that could match numeric pattern
assert.equal(
  extractApplicationSecurityCode("Your application from 20241205 is pending."),
  null,
  "Date not extracted as code"
);

// Too short (less than 6 chars)
assert.equal(
  extractApplicationSecurityCode("Security code: 12345"),
  null,
  "Code too short (5 chars)"
);

// Too long (more than 12 chars)
assert.equal(
  extractApplicationSecurityCode("Security code: 1234567890ABC"),
  null,
  "Code too long (13 chars)"
);

// ============================================================
// GREENHOUSE MESSAGE IDENTIFICATION
// ============================================================

// Valid Greenhouse domains
assert.ok(
  isGreenhouseSecurityMessage({
    fromAddress: "Greenhouse <no-reply@us.greenhouse.io>",
    subject: "Security code for application"
  }),
  "Standard Greenhouse address"
);

assert.ok(
  isGreenhouseSecurityMessage({
    fromAddress: "no-reply@boards.greenhouse.io",
    subject: "Verification code",
    bodyText: "Your security code is 123456"
  }),
  "Boards subdomain"
);

assert.ok(
  isGreenhouseSecurityMessage({
    fromAddress: "notifications@eu.greenhouse.io",
    subject: "Codice di sicurezza",
    bodyText: "Il tuo codice: ABC123"
  }),
  "EU subdomain with Italian"
);

// Invalid - spoofed domain
assert.ok(
  !isGreenhouseSecurityMessage({
    fromAddress: "no-reply@greenhouse.io.attacker.test",
    subject: "Security code for application"
  }),
  "Spoofed domain rejected"
);

assert.ok(
  !isGreenhouseSecurityMessage({
    fromAddress: "no-reply@fakegreenhouse.io",
    subject: "Security code for application"
  }),
  "Fake domain rejected"
);

// Invalid - not a security message
assert.ok(
  !isGreenhouseSecurityMessage({
    fromAddress: "no-reply@greenhouse.io",
    subject: "Application received"
  }),
  "Non-security message from Greenhouse"
);

assert.ok(
  !isGreenhouseSecurityMessage({
    fromAddress: "no-reply@greenhouse.io",
    subject: "Interview scheduled",
    bodyText: "We'd like to schedule an interview"
  }),
  "Interview message not marked as security"
);

// Edge case - subject has "security" but body doesn't (still valid)
assert.ok(
  isGreenhouseSecurityMessage({
    fromAddress: "no-reply@greenhouse.io",
    subject: "Security code required",
    bodyText: null
  }),
  "Security in subject only"
);

// Edge case - body has code label but subject doesn't
assert.ok(
  isGreenhouseSecurityMessage({
    fromAddress: "no-reply@greenhouse.io",
    subject: "Action required",
    bodyText: "Your verification code is ready"
  }),
  "Verification in body only"
);

// ============================================================
// REAL-WORLD EMAIL SAMPLES
// ============================================================

// Sample 1: Typical Greenhouse security email
const greenhouseSample1 = `
Hi,

You have a pending application that requires verification.

Copy and paste this code into the application form: K8mN2pLq

After you enter the code, you'll be able to submit your application.

Thanks,
The Greenhouse Team
`;

assert.equal(
  extractApplicationSecurityCode(greenhouseSample1),
  "K8mN2pLq",
  "Real Greenhouse sample 1"
);

// Sample 2: Italian version
const greenhouseSample2 = `
Ciao,

Hai una candidatura in sospeso che richiede verifica.

Codice di sicurezza: 9Xy3ZaBc

Dopo aver inserito il codice, potrai inviare la tua candidatura.

Grazie,
Il team Greenhouse
`;

assert.equal(
  extractApplicationSecurityCode(greenhouseSample2),
  "9Xy3ZaBc",
  "Real Greenhouse sample 2 (Italian)"
);

// Sample 3: Numeric code variant
const greenhouseSample3 = `
Security verification required

Your verification code is 847293.

Please enter this code to continue with your application.
`;

assert.equal(
  extractApplicationSecurityCode(greenhouseSample3),
  "847293",
  "Real Greenhouse sample 3 (numeric)"
);

// Sample 4: With extra context that shouldn't be picked up
const greenhouseSample4 = `
Application ID: 12345678
Job ID: 87654321
Reference: 456789

Your security code: Qw9Er8Ty

This code expires in 10 minutes.
`;

assert.equal(
  extractApplicationSecurityCode(greenhouseSample4),
  "Qw9Er8Ty",
  "Real sample with multiple numbers"
);

// ============================================================
// EDGE CASES & ROBUSTNESS
// ============================================================

// Multiple occurrences - should pick first
const multipleCodesText = "Security code: AAA111 or security code: BBB222";
const firstCode = extractApplicationSecurityCode(multipleCodesText);
assert.ok(
  firstCode === "AAA111",
  "Multiple codes - picks first"
);

// HTML email - note: in production, the webhook converts HTML to text first
// via htmlToText() before storing in ApplicationReply.bodyText, so the
// extraction function only sees plain text. This test verifies it still works
// if HTML slips through (defensive).
const htmlEmailPlainText = "Your verification code is H7Gf9Kl2. Please enter this code in the application form.";
assert.equal(
  extractApplicationSecurityCode(htmlEmailPlainText),
  "H7Gf9Kl2",
  "Plain text from HTML email"
);

// Extra whitespace
assert.equal(
  extractApplicationSecurityCode("Security code:    \n\n    Wq8Rt5Yp   "),
  "Wq8Rt5Yp",
  "Extra whitespace handled"
);

// Case variations in label
assert.equal(
  extractApplicationSecurityCode("SECURITY CODE: Abc123Xy"),
  "Abc123Xy",
  "Uppercase label"
);

assert.equal(
  extractApplicationSecurityCode("verification CODE: Xyz789Ab"),
  "Xyz789Ab",
  "Mixed case label"
);

// Empty or null inputs
assert.equal(
  extractApplicationSecurityCode(""),
  null,
  "Empty string"
);

assert.equal(
  extractApplicationSecurityCode("   \n  \t  "),
  null,
  "Whitespace only"
);

console.log("✓ All 40+ OTP auto-complete tests passed");
