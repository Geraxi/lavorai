import assert from "node:assert/strict";
import { classifyReply } from "../src/lib/reply-parser";

const cases = [
  { fromAddress: "no-reply@greenhouse.io", subject: "Security code for application", bodyText: "Thank you for applying. Your security code is EXAMPLE1.", kind: "auto", isHuman: false },
  { fromAddress: "notifications@example.com", subject: "Codice di verifica", kind: "auto", isHuman: false },
  { fromAddress: "noreply@example.com", subject: "Application received", bodyText: "We have received your application.", kind: "ricevuta", isHuman: false },
  { fromAddress: "do-not-reply@example.com", subject: "Account notification", kind: "auto", isHuman: false },
  { fromAddress: "mailer-daemon@example.com", subject: "Security code for application", kind: "bounce", isHuman: false },
  { fromAddress: "no-reply@example.com", subject: "Undeliverable: Security code for application", kind: "bounce", isHuman: false },
  { fromAddress: "recruiter@example.com", subject: "Interview invitation", kind: "colloquio", isHuman: true },
  { fromAddress: "noreply@example.com", bodyText: "Unfortunately, we will not be moving forward.", kind: "rifiutata", isHuman: true },
];
for (const { kind, isHuman, ...input } of cases) {
  assert.deepEqual(classifyReply(input), { kind, isHuman }, input.subject ?? input.bodyText);
}
console.log(`${cases.length} reply classification checks passed`);
