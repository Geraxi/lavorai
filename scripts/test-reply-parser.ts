import assert from "node:assert/strict";
import { classifyReply, replyKindToUserStatus } from "../src/lib/reply-parser";
import { classifyMailboxByRules, mailboxKindIsHuman, mailboxKindToReplyKind } from "../src/lib/application-mailbox";

const cases = [
  { fromAddress: "no-reply@greenhouse.io", subject: "Security code for application", bodyText: "Thank you for applying. Your security code is EXAMPLE1.", kind: "auto", isHuman: false, isSecurityCode: true },
  { fromAddress: "notifications@example.com", subject: "Codice di verifica", kind: "auto", isHuman: false, isSecurityCode: true },
  { fromAddress: "noreply@example.com", subject: "Application received", bodyText: "We have received your application.", kind: "ricevuta", isHuman: false },
  { fromAddress: "do-not-reply@example.com", subject: "Account notification", kind: "auto", isHuman: false },
  { fromAddress: "mailer-daemon@example.com", subject: "Security code for application", kind: "bounce", isHuman: false },
  { fromAddress: "no-reply@example.com", subject: "Undeliverable: Security code for application", kind: "bounce", isHuman: false },
  { fromAddress: "recruiter@example.com", subject: "Interview invitation", kind: "colloquio", isHuman: true },
  { fromAddress: "noreply@example.com", bodyText: "Unfortunately, we will not be moving forward.", kind: "rifiutata", isHuman: true },
  { fromAddress: "careers@monzo.com", subject: "Thanks for your email", bodyText: "Unfortunately we don't take any applications over email. Please apply via our careers site.", kind: "redirected_to_portal", isHuman: false },
  { fromAddress: "jane@example.com", subject: "Automatic reply", bodyText: "I am out of office until Monday.", kind: "auto_reply", isHuman: false },

  // --- Real production shapes (15 Nov 2026 audit), anonymised ---
  // adesso NL via Recruitee: Dutch auto-acknowledgement, was stored as risposta/human.
  { fromAddress: "adesso Netherlands <noreply@adessonetherlands.recruitee.com>", subject: "Bedankt voor jouw sollicitatie",
    bodyText: "Beste kandidaat,\n\nBedankt voor jouw sollicitatie voor de functie Senior Fullstack Java Developer. We nemen je sollicitatie zorgvuldig door en laten zo snel mogelijk van ons horen.\n\nHeb je vragen?\nNeem gerust contact op.\n\nMet vriendelijke groet,\nadesso Netherlands", kind: "ricevuta", isHuman: false },
  { fromAddress: "Talent Team <talent@adesso.nl>", subject: "Je sollicitatie", bodyText: "Bedankt voor je sollicitatie! Wij hebben je sollicitatie ontvangen en reageren binnen twee weken.", kind: "ricevuta", isHuman: false },
  { fromAddress: "jobs@firma.de", subject: "Eingangsbestätigung", bodyText: "Vielen Dank für Ihre Bewerbung. Ihre Bewerbung ist bei uns eingegangen.", kind: "ricevuta", isHuman: false },
  { fromAddress: "recrutement@societe.fr", subject: "Votre candidature", bodyText: "Merci pour votre candidature. Nous avons bien reçu votre candidature et reviendrons vers vous.", kind: "ricevuta", isHuman: false },
  // Greenhouse receipt (Deliveroo) and Recruitee receipt (Optics11) stay receipts.
  { fromAddress: "no-reply@us.greenhouse-mail.io", subject: "Thank you for applying to Deliveroo", bodyText: "We have received your application and will review it shortly.", kind: "ricevuta", isHuman: false },
  // Greenhouse security codes: 977 auto + 25 wrongly stored as bounce.
  { fromAddress: "Greenhouse <no-reply@us.greenhouse-mail.io>", subject: "Security code for your application to Deliveroo", bodyText: "Copy and paste this code into the security code field on your application: Xy7Qp2Lm", kind: "auto", isHuman: false, isSecurityCode: true },
  // Monzo: "we don't accept applications by email" variants (one was stored as rifiutata/human).
  { fromAddress: "careers@monzo.com", subject: "Re: Application", bodyText: "Hi there,\nThanks for getting in touch. Unfortunately we're unable to accept applications by email – please apply on monzo.com/careers.", kind: "redirected_to_portal", isHuman: false },
  { fromAddress: "talent@monzo.com", subject: "Thanks for your message", bodyText: "We do not currently accept CVs sent via e-mail. Applications sent by email will not be considered.", kind: "redirected_to_portal", isHuman: false },
  // Pennylane GDPR-mailbox autoresponder.
  { fromAddress: "privacy@pennylane.com", subject: "Re: Your application", bodyText: "Thank you for your email. Your request has been received and we will get back to you within 30 days.", kind: "auto_reply", isHuman: false },
  // Autoresponder headers.
  { fromAddress: "hr@acme.example", subject: "Re: Application", bodyText: "Thanks, noted.", headers: { "Auto-Submitted": "auto-replied" }, kind: "auto_reply", isHuman: false },
  { fromAddress: "hr@acme.example", subject: "Re: Application", bodyText: "Thanks, noted.", headers: { "X-Autoreply": "yes" }, kind: "auto_reply", isHuman: false },
  // Notifications and newsletters (legacy GmailMessage rows, all were risposta/human).
  { fromAddress: "Vercel <notifications@vercel.com>", subject: "Deployment ready", bodyText: "Your deployment is ready. Meet you at the next release.", kind: "auto", isHuman: false },
  { fromAddress: "GitHub <noreply@github.com>", subject: "[lavorai] PR #12", bodyText: "Can you review this?", kind: "auto", isHuman: false },
  { fromAddress: "Tide <hello@tide.co>", subject: "Your November update", bodyText: "Here's what's new. Unsubscribe", kind: "auto", isHuman: false },
  { fromAddress: "GulfTalent <jobs@gulftalent.com>", subject: "12 new jobs for you", bodyText: "New jobs matching your profile.", kind: "auto", isHuman: false },
  { fromAddress: "SAP SuccessFactors <alerts@jobs2web.com>", subject: "Job alert", bodyText: "New positions are available.", kind: "auto", isHuman: false },
  { fromAddress: "GEMA <newsletter@gema.de>", subject: "Angebot", bodyText: "Nur heute!", kind: "auto", isHuman: false },
  { fromAddress: "Some Shop <hello@shop.example>", subject: "Black Friday", bodyText: "Huge savings", headers: { "List-Unsubscribe": "<mailto:u@shop.example>" }, kind: "auto", isHuman: false },
  // ATS relay with no question and no decision: automated.
  { fromAddress: "Acme Hiring <hiring@acme.recruitee.com>", subject: "Update on your application", bodyText: "Your application status has changed. Log in to view it.", kind: "auto", isHuman: false },
  // Real humans still count.
  { fromAddress: "Jane Doe <jane.doe@acme.example>", subject: "Your application", bodyText: "Hi Mario,\nthanks for applying! What are your salary expectations?", kind: "risposta", isHuman: true },
  { fromAddress: "Jane Doe <jane.doe@acme.example>", subject: "Re: Developer role", bodyText: "Hi Mario, would love to chat. Are you available Tuesday?", kind: "colloquio", isHuman: true },
  { fromAddress: "Acme Hiring <hiring@acme.recruitee.com>", subject: "Re: Developer role", bodyText: "Hi Mario, could you send us your portfolio before Friday?", kind: "risposta", isHuman: true },
  { fromAddress: "hr@firma.nl", subject: "Je sollicitatie", bodyText: "Helaas hebben we besloten om verder te gaan met andere kandidaten.", kind: "rifiutata", isHuman: true },
];
for (const { kind, isHuman, isSecurityCode, ...input } of cases) {
  assert.deepEqual(classifyReply(input), isSecurityCode ? { kind, isHuman, isSecurityCode } : { kind, isHuman }, `${input.fromAddress} | ${input.subject ?? input.bodyText}`);
}
// Nothing automated may ever set userStatus=risposta (or any status).
for (const { isHuman, ...input } of cases) {
  const reply = classifyReply(input);
  if (!isHuman) assert.equal(reply.isHuman ? replyKindToUserStatus(reply.kind) : null, null);
  // Mailbox path (live inbound): automated mail stays non-human and skips the AI fallback.
  const mailbox = classifyMailboxByRules(input);
  if (!isHuman) {
    assert.equal(mailboxKindIsHuman(mailbox.kind), false, `${input.fromAddress} mailbox ${mailbox.kind}`);
    assert.ok(mailbox.kind !== "other" || mailbox.final === true, `${input.fromAddress} must not reach AI fallback`);
    // Stored as non-human, so applyReplyToApplication never sets userStatus.
    assert.ok(!mailboxKindIsHuman(mailbox.kind) && mailboxKindToReplyKind(mailbox.kind) !== "colloquio" && mailboxKindToReplyKind(mailbox.kind) !== "rifiutata");
  }
}
console.log(`${cases.length} reply classification checks passed (multilingual receipts, autoresponder headers, security codes, notifications/newsletters, human signals)`);

// Opt-in reclassify planner (pure): demotes, never promotes; keeps user-set statuses.
import { planReplyReclassification } from "../src/lib/reply-reclassify";
{
  const at = (d: number) => new Date(Date.UTC(2026, 10, d));
  const replies = [
    { id: "r1", applicationId: "a1", fromAddress: "adesso Netherlands <noreply@adessonetherlands.recruitee.com>", subject: "Bedankt voor jouw sollicitatie", bodyText: "Bedankt voor jouw sollicitatie voor de functie Senior Fullstack Java Developer.", kind: "risposta", isHuman: true, isSecurityCode: false, receivedAt: at(14) },
    { id: "r2", applicationId: "a2", fromAddress: "no-reply@us.greenhouse-mail.io", subject: "Security code for your application to Deliveroo", bodyText: "Your security code is Xy7Qp2Lm", kind: "bounce", isHuman: false, isSecurityCode: false, receivedAt: at(1) },
    { id: "r3", applicationId: "a3", fromAddress: "careers@monzo.com", subject: "Re", bodyText: "We don't accept applications by email.", kind: "rifiutata", isHuman: true, isSecurityCode: false, receivedAt: at(2) },
    { id: "r4", applicationId: "a4", fromAddress: "jane.doe@acme.example", subject: "Hi", bodyText: "What are your salary expectations?", kind: "risposta", isHuman: false, isSecurityCode: false, receivedAt: at(3) },
  ];
  const apps = [
    { id: "a1", userStatus: "risposta", replyCount: 1, lastReplyKind: "risposta" },
    { id: "a2", userStatus: null, replyCount: 0, lastReplyKind: null },
    { id: "a3", userStatus: "rifiutata", replyCount: 1, lastReplyKind: "rifiutata" },
    { id: "a4", userStatus: null, replyCount: 0, lastReplyKind: null },
  ];
  const plan = planReplyReclassification(replies, apps);
  assert.deepEqual(plan.replies.map(c => [c.id, c.to.kind, c.to.isHuman, c.to.isSecurityCode]), [["r1", "ricevuta", false, false], ["r2", "auto", false, true], ["r3", "redirected_to_portal", false, false]]);
  assert.deepEqual(plan.applications.find(a => a.id === "a1")?.data, { replyCount: 0, userStatus: null, lastReplyKind: "ricevuta" });
  assert.deepEqual(plan.applications.find(a => a.id === "a3")?.data, { replyCount: 0, lastReplyKind: "redirected_to_portal" }, "rifiutata status is never auto-withdrawn");
  assert.equal(plan.replies.some(c => c.id === "r4"), false, "never promotes to human");
  console.log("PASS reclassify planner: demote-only, security codes out of bounce, userStatus=risposta withdrawn only without human replies");
}
