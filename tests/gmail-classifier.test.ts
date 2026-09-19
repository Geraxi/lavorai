/**
 * Smoke tests for Gmail integration classifier and matching logic.
 * 
 * Run with: npx tsx tests/gmail-classifier.test.ts
 */

import { classifyReply } from "../src/lib/reply-parser";

// Test cases for classifier
const testCases = [
  {
    name: "Interview invitation (English)",
    input: {
      fromAddress: "recruiter@example.com",
      subject: "Interview for Senior Developer position",
      bodyText: "We would love to schedule a call with you next week. Are you available?",
    },
    expected: { kind: "colloquio", isHuman: true },
  },
  {
    name: "Interview invitation (Italian)",
    input: {
      fromAddress: "hr@azienda.it",
      subject: "Colloquio per il ruolo di Product Manager",
      bodyText: "Ci piacerebbe conoscerti. Quando saresti disponibile per una videochiamata?",
    },
    expected: { kind: "colloquio", isHuman: true },
  },
  {
    name: "Rejection (English)",
    input: {
      fromAddress: "talent@startup.com",
      subject: "Update on your application",
      bodyText: "Unfortunately, we have decided to move forward with other candidates. We wish you the best.",
    },
    expected: { kind: "rifiutata", isHuman: true },
  },
  {
    name: "Rejection (Italian)",
    input: {
      fromAddress: "recruiting@company.it",
      subject: "Candidatura per Developer",
      bodyText: "Purtroppo non possiamo procedere con la tua candidatura in questo momento.",
    },
    expected: { kind: "rifiutata", isHuman: true },
  },
  {
    name: "Application confirmation (ATS)",
    input: {
      fromAddress: "noreply@greenhouse.io",
      subject: "Application received: Software Engineer",
      bodyText: "Thank you for your application. We have received it and will review shortly.",
    },
    expected: { kind: "ricevuta", isHuman: false },
  },
  {
    name: "Out of office (auto-reply)",
    input: {
      fromAddress: "manager@company.com",
      subject: "Out of office",
      bodyText: "I am currently out of office and will respond when I return.",
    },
    expected: { kind: "auto", isHuman: false },
  },
  {
    name: "Bounce (mailer-daemon)",
    input: {
      fromAddress: "mailer-daemon@mail.server.com",
      subject: "Delivery Status Notification (Failure)",
      bodyText: "Your message could not be delivered.",
    },
    expected: { kind: "bounce", isHuman: false },
  },
  {
    name: "Generic recruiter response (English)",
    input: {
      fromAddress: "recruiter@tech.com",
      subject: "RE: Your application",
      bodyText: "Hi, thanks for applying. I wanted to touch base about your profile.",
    },
    expected: { kind: "risposta", isHuman: true },
  },
];

function runTests() {
  console.log("🧪 Running Gmail classifier smoke tests...\n");

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    const result = classifyReply(test.input);
    const success =
      result.kind === test.expected.kind && result.isHuman === test.expected.isHuman;

    if (success) {
      console.log(`✅ ${test.name}`);
      passed++;
    } else {
      console.log(`❌ ${test.name}`);
      console.log(`   Expected: ${JSON.stringify(test.expected)}`);
      console.log(`   Got: ${JSON.stringify(result)}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("✨ All tests passed!");
  }
}

runTests();
