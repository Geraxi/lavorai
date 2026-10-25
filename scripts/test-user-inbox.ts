/**
 * Per-user inbox unit tests. NO network, NO database (in-memory fake).
 * Run: npx tsx scripts/test-user-inbox.ts
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
globalThis.fetch = (async () => { throw new Error("NETWORK_FORBIDDEN_IN_TESTS"); }) as typeof fetch;

import { slugBase, newSlug, inboxRecipients, userInboxDomain } from "../src/lib/inbound/address";
import { extractCodes, extractLinks } from "../src/lib/inbound/extract";
import { classifyByRules, classifyInbound } from "../src/lib/inbound/classify";
import { bestApplicationMatch } from "../src/lib/inbound/match";
import { verifySvixSignature } from "../src/lib/inbound/signature";
import { resendInbound } from "../src/lib/inbound/providers";
import { processUserInboundEmail, ensureUserInbox } from "../src/lib/inbound/service";

// address
assert.equal(slugBase("Mario Rossì"), "mario.rossi");
assert.equal(slugBase("  ", "anna_b@x.it"), "anna.b");
assert.equal(slugBase(null, null), "candidato");
assert.equal(newSlug("Mario Rossi", null, () => "a1b2c3"), "mario.rossi.a1b2c3");
assert.equal(userInboxDomain({}), "apply.lavorai.it");
assert.equal(userInboxDomain({ INBOUND_USER_DOMAIN: "bad domain" }), null);
assert.deepEqual(inboxRecipients(["Mario <Mario.Rossi.a1@apply.lavorai.it>", "reply+app1@apply.lavorai.it", "x@other.it", "mario.rossi.a1+acme@apply.lavorai.it"], "apply.lavorai.it"), ["mario.rossi.a1@apply.lavorai.it"]);

// extraction
assert.deepEqual(extractCodes("Your verification code is 482913. It expires in 10 minutes."), ["482913"]);
assert.deepEqual(extractCodes("Il tuo codice di verifica: A7K2Q9"), ["A7K2Q9"]);
assert.deepEqual(extractCodes("OTP: 123 456"), ["123456"]);
assert.deepEqual(extractCodes("Job ID 2026-48291, call +39 333 1234567, posted 2026"), []);
const links = extractLinks("Confirm: https://ats.example.com/verify?token=abc. Jobs: https://ats.example.com/jobs", '<a href="https://ats.example.com/confirm-email?t=1&amp;u=2">x</a> <a href="http://insecure.example">y</a>');
assert.deepEqual(links.map((l) => [l.url, l.kind]), [["https://ats.example.com/confirm-email?t=1&u=2", "verification"], ["https://ats.example.com/verify?token=abc", "verification"], ["https://ats.example.com/jobs", "other"]]);

// classification (IT + EN)
const cases: Array<[string, string, string]> = [
  ["Thank you for applying to Acme", "We have received your application for Backend Engineer. If your profile matches we may invite you to an interview.", "confirmation"],
  ["Candidatura ricevuta", "Gentile Mario, abbiamo ricevuto la tua candidatura per Sviluppatore.", "confirmation"],
  ["Your application to Acme", "Thank you for applying. Unfortunately, we have decided to move forward with other candidates.", "rejection"],
  ["Aggiornamento candidatura", "Purtroppo abbiamo deciso di proseguire con altri candidati.", "rejection"],
  ["Interview invitation", "We would like to invite you to an interview. Please share your availability.", "interview"],
  ["Colloquio", "Vorremmo invitarti a un colloquio conoscitivo, indicaci la tua disponibilità.", "interview"],
  ["Action required", "Please verify your email to complete your application.", "incomplete"],
  ["Completa la candidatura", "Completa la tua candidatura inserendo il codice di verifica 123456.", "incomplete"],
  ["Newsletter", "Discover our new offices", "other"],
  ["Thanks for your email", "Unfortunately we don't take any applications over email. Please apply via our careers site.", "incomplete"],
];
for (const [s, b, want] of cases) assert.equal(classifyByRules(s, b), want, `${s}`);

async function main() {
  assert.deepEqual(await classifyInbound("Hi", "random", async () => "interview"), { category: "interview", by: "ai" });
  assert.deepEqual(await classifyInbound("Hi", "random", async () => { throw new Error("ai down"); }), { category: "other", by: "rules" });
  assert.deepEqual(await classifyInbound("Thank you for applying", "x", async () => "rejection"), { category: "confirmation", by: "rules" }, "rules win, AI only for other");

  // matching
  const cands = [
    { id: "a1", company: "Acme S.p.A.", title: "Backend Engineer", at: new Date("2026-10-20") },
    { id: "a2", company: "Globex", title: "Data Analyst", at: new Date("2026-10-21") },
    { id: "a3", company: "Acme S.p.A.", title: "Product Designer", at: new Date("2026-10-22") },
  ];
  assert.equal(bestApplicationMatch(cands, { from: "no-reply@greenhouse.io", subject: "Thank you for applying to Acme", body: "for the Backend Engineer role" }), "a1");
  assert.equal(bestApplicationMatch(cands, { from: "jobs@acme.com", subject: "Application received", body: "Thanks!" }), null, "two Acme jobs, no title → ambiguous");
  assert.equal(bestApplicationMatch(cands, { from: "talent@globex.com", subject: "Candidatura ricevuta", body: "" }), "a2");
  assert.equal(bestApplicationMatch(cands, { from: "x@initech.com", subject: "Backend Engineer", body: "" }), null, "title alone is not enough");

  // signature
  const secret = `whsec_${Buffer.from("k".repeat(24)).toString("base64")}`;
  const body = JSON.stringify({ type: "email.received", created_at: "2026-10-23T08:00:00Z", data: { email_id: "em_1", from: "no-reply@greenhouse.io", to: ["mario.rossi.a1@apply.lavorai.it"], subject: "Thank you for applying to Acme", message_id: "<m1@gh>" } });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", Buffer.from("k".repeat(24))).update(`msg_1.${ts}.${body}`).digest("base64");
  const h = (o: Record<string, string>) => new Headers(o);
  assert.ok(verifySvixSignature(h({ "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": `v1,${sig}` }), body, secret));
  assert.ok(!verifySvixSignature(h({ "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": `v1,${sig}` }), body + " ", secret));
  assert.ok(!verifySvixSignature(h({ "svix-id": "msg_1", "svix-timestamp": String(+ts - 1000), "svix-signature": `v1,${sig}` }), body, secret));
  assert.ok(!resendInbound.verify(h({}), body, {}), "no secret → reject outside dev");
  assert.ok(resendInbound.verify(h({ "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": `v1,${sig}` }), body, { RESEND_INBOUND_SECRET: secret }));

  // provider parse + hydrate (fake fetch)
  const parsed = resendInbound.parse(body)!;
  assert.equal(parsed.providerMessageId, "em_1");
  assert.equal(resendInbound.parse(JSON.stringify({ type: "email.sent", data: {} })), null);
  assert.throws(() => resendInbound.parse(JSON.stringify({ type: "email.received", data: {} })));
  const calls: Array<{ url: string; authorization?: string }> = [];
  const hydrated = await resendInbound.hydrate(parsed, { RESEND_API_KEY: "re_send", RESEND_RECEIVING_API_KEY: "re_recv" }, async (url, init) => {
    calls.push({ url, authorization: (init?.headers as { Authorization?: string } | undefined)?.Authorization });
    return new Response(JSON.stringify({ text: "We have received your application for the Backend Engineer position.", html: null, headers: { from: "Acme Careers <no-reply@greenhouse.io>" } }), { status: 200 });
  });
  assert.equal(calls[0]?.url, "https://api.resend.com/emails/receiving/em_1");
  assert.equal(calls[0]?.authorization, "Bearer re_recv");
  const fallback = await resendInbound.hydrate(parsed, { RESEND_API_KEY: "re_send" }, async (_url, init) => {
    assert.equal((init?.headers as { Authorization?: string } | undefined)?.Authorization, "Bearer re_send");
    return new Response(JSON.stringify({ text: "fallback body", html: null, headers: {} }), { status: 200 });
  });
  assert.match(fallback.text ?? "", /fallback body/);
  assert.match(hydrated.text ?? "", /Backend Engineer/);

  // processing with fake DB
  const inboxes = [{ id: "ib1", userId: "u1", address: "mario.rossi.a1@apply.lavorai.it", disabledAt: null }];
  const stored: any[] = []; const raws: unknown[][] = [];
  const db: any = {
    userInbox: { findMany: async ({ where }: any) => inboxes.filter((i) => where.address.in.includes(i.address)) },
    inboundEmail: {
      findUnique: async ({ where }: any) => stored.find((s) => s.providerMessageId === where.provider_providerMessageId.providerMessageId) ?? null,
      create: async ({ data }: any) => { const r = { id: `ie${stored.length + 1}`, ...data }; stored.push(r); return r; },
    },
    application: { findMany: async () => [
      { id: "a1", submittedAt: null, createdAt: new Date("2026-10-20"), job: { company: "Acme", title: "Backend Engineer", url: "https://boards.greenhouse.io/acme/jobs/1" } },
      { id: "a2", submittedAt: null, createdAt: new Date("2026-10-21"), job: { company: "Globex", title: "Data Analyst", url: "https://x" } },
    ] },
    $executeRaw: async (...args: unknown[]) => { raws.push(args); return 1; },
  };
  const r = await processUserInboundEmail(hydrated, { db, env: {}, now: () => new Date("2026-10-23T09:00:00Z") });
  assert.deepEqual(r, { stored: 1, duplicates: 0, unknownRecipient: false, confirmed: ["a1"] });
  assert.equal(stored[0].category, "confirmation"); assert.equal(stored[0].applicationId, "a1");
  assert.equal(stored[0].mailboxKind, "confirmation");
  assert.equal(stored[0].notifyStatus, "digest_queued");
  assert.equal(raws.length, 1);
  const sql = (raws[0][0] as TemplateStringsArray).join("?");
  assert.match(sql, /"confirmedAt" = \?/); assert.match(sql, /'ats_confirmation_email'::"SentProofType"/); assert.match(sql, /"confirmedAt" IS NULL/);
  assert.ok(raws[0].includes("inbound:ie1") && raws[0].includes("a1") && raws[0].includes("u1"));
  const again = await processUserInboundEmail(hydrated, { db, env: {} });
  assert.equal(again.duplicates, 1); assert.equal(raws.length, 1, "replay does not re-confirm");
  const unknown = await processUserInboundEmail({ ...hydrated, providerMessageId: "em_2", to: ["nobody@apply.lavorai.it"] }, { db, env: {} });
  assert.equal(unknown.unknownRecipient, true); assert.equal(stored.length, 1);
  // missing proof columns (proof_of_send migration not applied) → logged, not thrown
  db.$executeRaw = async () => { throw Object.assign(new Error("column does not exist"), { code: "P2010", meta: { code: "42703" } }); };
  const errs: unknown[] = []; const orig = console.error; console.error = (...a: unknown[]) => errs.push(a);
  const r3 = await processUserInboundEmail({ ...hydrated, providerMessageId: "em_3" }, { db, env: {} });
  console.error = orig;
  assert.deepEqual(r3.confirmed, []); assert.equal(r3.stored, 1); assert.match(String(errs[0]), /42703/);
  assert.ok(!JSON.stringify(errs).includes("greenhouse"), "no sender in logs");

  const notices: string[] = [];
  const interview = await processUserInboundEmail({
    ...hydrated,
    providerMessageId: "em_interview",
    subject: "Interview invitation",
    text: "We would like to invite you to an interview. Please share your availability.",
    from: "jane@acme.com",
  }, {
    db,
    env: {},
    notify: async (n) => { notices.push(n.kind); return true; },
  });
  assert.equal(interview.stored, 1);
  assert.equal(stored.at(-1)?.mailboxKind, "interview");
  assert.equal(stored.at(-1)?.notifyStatus, "pending");
  assert.deepEqual(notices, ["interview"]);

  // ensureUserInbox: idempotent + collision retry
  const rows: any[] = [{ id: "x", userId: "other", slug: "mario.rossi.aaaaaa", address: "mario.rossi.aaaaaa@apply.lavorai.it" }];
  const { Prisma } = await import("@prisma/client");
  const idb: any = {
    user: { findUnique: async () => ({ name: "Mario Rossi", email: "m@x.it" }) },
    userInbox: {
      findUnique: async ({ where }: any) => rows.find((r) => r.userId === where.userId) ?? null,
      create: async ({ data }: any) => {
        if (rows.some((r) => r.slug === data.slug)) throw new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" });
        const r = { id: "n", ...data }; rows.push(r); return r;
      },
    },
  };
  const made = await ensureUserInbox(idb, "u1", {});
  assert.match(made.address, /^mario\.rossi\.[0-9a-f]{6}@apply\.lavorai\.it$/);
  assert.equal((await ensureUserInbox(idb, "u1", {})).address, made.address);

  console.log("user inbox (unit): all tests passed");
}
main().catch((e) => { process.stderr.write(String(e?.stack ?? e) + "\n"); process.exit(1); });
