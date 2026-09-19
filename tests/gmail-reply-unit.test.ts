/**
 * Unit tests for Gmail reply application logic (without database).
 * Tests the classification and filtering logic.
 * 
 * Run with: npx tsx tests/gmail-reply-unit.test.ts
 */

import { classifyReply } from "../src/lib/reply-parser";

console.log("🧪 Running Gmail reply application unit tests...\n");

let passed = 0;
let failed = 0;

// Test 1: OTP/security codes are classified as auto (not human)
{
  const name = "OTP/security code is classified as auto";
  const result = classifyReply({
    fromAddress: "noreply@greenhouse.io",
    subject: "Security code for your application",
    bodyText: "Your verification code is: 123456. Please enter this code to complete your application.",
  });

  if (result.kind === "auto" && result.isHuman === false) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.log(`❌ ${name}`);
    console.log(`   Expected: { kind: "auto", isHuman: false }`);
    console.log(`   Got: ${JSON.stringify(result)}`);
    failed++;
  }
}

// Test 2: Interview invitation is classified as colloquio (human)
{
  const name = "Interview invitation is classified as colloquio (human)";
  const result = classifyReply({
    fromAddress: "recruiter@testcorp.com",
    subject: "Interview for Senior Developer",
    bodyText: "We'd love to schedule a call with you next week. Are you available?",
  });

  if (result.kind === "colloquio" && result.isHuman === true) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.log(`❌ ${name}`);
    console.log(`   Expected: { kind: "colloquio", isHuman: true }`);
    console.log(`   Got: ${JSON.stringify(result)}`);
    failed++;
  }
}

// Test 3: Rejection is classified as rifiutata (human)
{
  const name = "Rejection is classified as rifiutata (human)";
  const result = classifyReply({
    fromAddress: "talent@startup.com",
    subject: "Update on your application",
    bodyText: "Unfortunately, we have decided to move forward with other candidates.",
  });

  if (result.kind === "rifiutata" && result.isHuman === true) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.log(`❌ ${name}`);
    console.log(`   Expected: { kind: "rifiutata", isHuman: true }`);
    console.log(`   Got: ${JSON.stringify(result)}`);
    failed++;
  }
}

// Test 4: Generic recruiter response is classified as risposta (human)
{
  const name = "Generic recruiter response is classified as risposta (human)";
  const result = classifyReply({
    fromAddress: "recruiter@tech.com",
    subject: "RE: Your application",
    bodyText: "Hi, thanks for applying. I wanted to touch base about your profile.",
  });

  if (result.kind === "risposta" && result.isHuman === true) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.log(`❌ ${name}`);
    console.log(`   Expected: { kind: "risposta", isHuman: true }`);
    console.log(`   Got: ${JSON.stringify(result)}`);
    failed++;
  }
}

// Test 5: Auto-reply is classified as auto (not human)
{
  const name = "Auto-reply is classified as auto (not human)";
  const result = classifyReply({
    fromAddress: "manager@company.com",
    subject: "Out of office",
    bodyText: "I am currently out of office and will respond when I return.",
  });

  if (result.kind === "auto" && result.isHuman === false) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.log(`❌ ${name}`);
    console.log(`   Expected: { kind: "auto", isHuman: false }`);
    console.log(`   Got: ${JSON.stringify(result)}`);
    failed++;
  }
}

// Test 6: Bounce is classified as bounce (not human)
{
  const name = "Bounce is classified as bounce (not human)";
  const result = classifyReply({
    fromAddress: "mailer-daemon@mail.server.com",
    subject: "Delivery Status Notification (Failure)",
    bodyText: "Your message could not be delivered.",
  });

  if (result.kind === "bounce" && result.isHuman === false) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.log(`❌ ${name}`);
    console.log(`   Expected: { kind: "bounce", isHuman: false }`);
    console.log(`   Got: ${JSON.stringify(result)}`);
    failed++;
  }
}

// Test 7: Application confirmation is classified as ricevuta (not human)
{
  const name = "Application confirmation is classified as ricevuta (not human)";
  const result = classifyReply({
    fromAddress: "noreply@greenhouse.io",
    subject: "Application received: Software Engineer",
    bodyText: "Thank you for your application. We have received it and will review shortly.",
  });

  if (result.kind === "ricevuta" && result.isHuman === false) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.log(`❌ ${name}`);
    console.log(`   Expected: { kind: "ricevuta", isHuman: false }`);
    console.log(`   Got: ${JSON.stringify(result)}`);
    failed++;
  }
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log("\n❌ Some tests failed");
  process.exit(1);
} else {
  console.log("\n✨ All tests passed!");
}
