import assert from "node:assert/strict";
import { extractApplicationSecurityCode as extract, isGreenhouseSecurityMessage as isSecurity, hasApplicationConfirmation as confirmed } from "../src/lib/application-security-code";

assert.equal(extract("Copy and paste this code into the application form: YqOsq2bB\nAfter you enter"), "YqOsq2bB");
assert.equal(extract("Your verification code is 123456."), "123456");
assert.equal(extract("Security code:\nAbCdEfGh"), "AbCdEfGh");
assert.equal(extract("Codice di sicurezza: aB123456"), "aB123456");
assert.equal(extract("Application 12345678. Your security code will arrive shortly."), null);
assert.equal(extract("Security code for application"), null);
assert.equal(extract("Reference 123456"), null);
assert.ok(isSecurity({fromAddress: "Greenhouse <no-reply@us.greenhouse.io>", subject: "Security code for application"}));
assert.ok(!isSecurity({fromAddress: "no-reply@greenhouse.io.attacker.test", subject: "Security code for application"}));
assert.ok(!isSecurity({fromAddress: "no-reply@greenhouse.io", subject: "Application received"}));
assert.ok(confirmed("Your application has been received", "https://boards.greenhouse.io/jobs/1"));
assert.ok(confirmed("", "https://boards.greenhouse.io/company/thank_you"));
assert.ok(!confirmed("Thank you for your interest. Enter your security code.", "https://boards.greenhouse.io/jobs/1"));
assert.ok(!confirmed("", "https://boards.greenhouse.io/confirmation-company/jobs/1"));
console.log("14 security-code checks passed");
