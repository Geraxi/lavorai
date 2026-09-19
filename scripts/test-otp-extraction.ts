import { extractApplicationSecurityCode, isGreenhouseSecurityMessage } from "../src/lib/application-security-code";

const testCases = [
  {
    name: "Real Greenhouse email",
    body: `Security code for your application to SumUp

Hi,

You're receiving this email because you (or someone pretending to be you) recently requested a security code while applying to one of our jobs.

Copy and paste this code on the application page to continue your application:

 2Oy2H4pU

After you enter the code, you can return to the application and finish.

Best,
SumUp Recruiting`,
    expected: "2Oy2H4pU",
  },
  {
    name: "Italian Greenhouse email",
    body: `Codice di sicurezza per la tua candidatura

Il tuo codice di verifica è:

 A1B2C3D4

Inseriscilo nella pagina.`,
    expected: "A1B2C3D4",
  },
  {
    name: "Alternative phrasing",
    body: `Your security code is: XyZ789Qw

After entering`,
    expected: "XyZ789Qw",
  },
  {
    name: "No code present",
    body: "This is just a regular email without any code",
    expected: null,
  },
];

console.log("\n🧪 Testing OTP extraction...\n");

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const result = extractApplicationSecurityCode(tc.body);
  const ok = result === tc.expected;
  if (ok) {
    console.log(`✅ ${tc.name}: ${result || "(null)"}`);
    passed++;
  } else {
    console.log(`❌ ${tc.name}: expected ${tc.expected}, got ${result}`);
    failed++;
  }
}

// Test isGreenhouseSecurityMessage
console.log("\n🧪 Testing Greenhouse message detection...\n");

const msgTests = [
  {
    from: "no-reply@greenhouse.io",
    subject: "Security code",
    body: "Your code is 123456",
    expected: true,
  },
  {
    from: "hr@company.com",
    subject: "Security code",
    body: "Your code is 123456",
    expected: false,
  },
  {
    from: "no-reply@greenhouse.io",
    subject: "Application received",
    body: "Thank you",
    expected: false,
  },
];

for (const tc of msgTests) {
  const result = isGreenhouseSecurityMessage({
    fromAddress: tc.from,
    subject: tc.subject,
    bodyText: tc.body,
  });
  const ok = result === tc.expected;
  if (ok) {
    console.log(`✅ ${tc.from} + "${tc.subject}": ${result}`);
    passed++;
  } else {
    console.log(`❌ ${tc.from} + "${tc.subject}": expected ${tc.expected}, got ${result}`);
    failed++;
  }
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
