import assert from "node:assert/strict";
import { extractGmailBody } from "../src/lib/gmail-body";
import { formatInboxEmailText } from "../src/lib/inbox-email-text";
import { isLikelyJobMail } from "../src/lib/gmail-match";

const encoded = (text: string) => Buffer.from(text).toString("base64url");

assert.equal(
  extractGmailBody({ mimeType: "multipart/mixed", parts: [{ mimeType: "multipart/alternative", parts: [
    { mimeType: "text/plain", body: { data: encoded("Hello &#128200; team") } },
    { mimeType: "text/html", body: { data: encoded("<p>Wrong fallback</p>") } },
  ] }] }, "snippet"),
  "Hello 📈 team",
);
assert.equal(
  extractGmailBody({ mimeType: "multipart/alternative", parts: [
    { mimeType: "text/html", body: { data: encoded("<style>.x{}</style><p>Hi &amp; welcome</p><p>Second line</p>") } },
  ] }, "snippet"),
  "Hi & welcome\nSecond line",
);
assert.equal(formatInboxEmailText("https://example.com/" + "x".repeat(200)), "[link lungo omesso]");
assert.equal(isLikelyJobMail("Funding Options <hello@fundingoptions.tide.co>", "Recovery Loan Scheme", "Trouble viewing this email? View it in your browser. Application for Agoda mentioned in footer."), false);
assert.equal(isLikelyJobMail("jobs@company.com", "Application received", "Thank you for applying."), true);
console.log("5 inbox rendering checks passed");
