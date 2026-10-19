/**
 * Local-only seed for dashboard screenshots / manual QA.
 *
 * Populated users get ~8 weeks of history (delivered sends, replies, interviews)
 * so the dashboard sparklines and weekly trend have real timestamps.
 *
 * Creates three password-login users (password: "LocalTest123!"):
 *   - test-dashboard@lavorai.test  populated (make it admin locally via ADMIN_EMAILS)
 *   - test-empty@lavorai.test      no applications, no CV
 *   - test-nonadmin@lavorai.test   populated, never admin
 *
 * Run:  set -a; . ./.env.local; set +a; npx tsx scripts/seed-local-dashboard-users.ts
 *
 * SAFETY: refuses to run unless DATABASE_URL points at localhost and the
 * database name contains "test". Re-running wipes and recreates these users.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const dbUrl = process.env.DATABASE_URL ?? "";
let parsed: URL | null = null;
try { parsed = new URL(dbUrl); } catch { parsed = null; }
if (!parsed || !["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.includes("test")) {
  throw new Error("Refusing to seed: DATABASE_URL must be a localhost database whose name contains 'test'.");
}

const prisma = new PrismaClient();
const PASSWORD = "LocalTest123!";
const NOW = Date.now();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000);
const rnd = () => crypto.randomBytes(8).toString("hex");

async function makeUser(email: string, name: string) {
  await prisma.user.deleteMany({ where: { email } });
  return prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      emailVerified: daysAgo(30),
      privacyConsentAt: daysAgo(30),
      onboardedAt: daysAgo(29),
      welcomeSeenAt: daysAgo(30),
      lastLoginAt: daysAgo(1),
      tier: "pro",
      subscriptionStatus: "active",
      stripeCustomerId: `cus_local_${rnd()}`,
      stripeSubscriptionId: `sub_local_${rnd()}`,
      currentPeriodEnd: new Date(NOW + 30 * 86_400_000),
      locale: "it",
      createdAt: daysAgo(30),
    },
  });
}

const JOBS = [
  { externalId: "local-dash-1", title: "Senior Product Designer", company: "Satispay", location: "Milano" },
  { externalId: "local-dash-2", title: "Product Designer", company: "Bending Spoons", location: "Milano" },
  { externalId: "local-dash-3", title: "UX/UI Designer", company: "Credimi", location: "Milano" },
  { externalId: "local-dash-4", title: "Senior UX Designer", company: "Docebo", location: "Milano" },
  { externalId: "local-dash-5", title: "Product Designer (Remote)", company: "Prima", location: "Remoto" },
  { externalId: "local-dash-6", title: "Lead Product Designer", company: "Tlon", location: "Roma" },
  { externalId: "local-dash-7", title: "Design Systems Designer", company: "Musixmatch", location: "Bologna" },
  { externalId: "local-dash-8", title: "Product Designer", company: "Shopfully", location: "Bologna", closed: true },
  // Older (delivered) applications spread over ~8 weeks for the trend visuals.
  { externalId: "local-dash-9", title: "UX Designer", company: "Fabrick", location: "Milano" },
  { externalId: "local-dash-10", title: "Product Designer", company: "Scalapay", location: "Milano" },
  { externalId: "local-dash-11", title: "UI Designer", company: "Casavo", location: "Milano" },
  { externalId: "local-dash-12", title: "Product Designer", company: "Moneyfarm", location: "Milano" },
  { externalId: "local-dash-13", title: "Senior Product Designer", company: "Treatwell", location: "Remoto" },
  { externalId: "local-dash-14", title: "Product Designer", company: "Yoox", location: "Bologna" },
  { externalId: "local-dash-15", title: "UX Researcher", company: "Subito", location: "Milano" },
  { externalId: "local-dash-16", title: "Product Designer", company: "Igloo", location: "Remoto" },
  { externalId: "local-dash-17", title: "Visual Designer", company: "Wonderflow", location: "Remoto" },
];

async function seedJobs() {
  const ids: Record<string, string> = {};
  for (const j of JOBS) {
    const data = {
      externalId: j.externalId,
      source: "local_seed",
      title: j.title,
      company: j.company,
      location: `${j.location}, Italia`,
      description: `${j.title} presso ${j.company}.`,
      url: `https://example.test/jobs/${j.externalId}`,
      contractType: "permanent",
      remote: j.location === "Remoto",
      category: "design",
      postedAt: daysAgo(6),
      cachedAt: daysAgo(1),
      closedAt: j.closed ? daysAgo(5) : null,
    };
    const job = await prisma.job.upsert({
      where: { externalId_source: { externalId: j.externalId, source: "local_seed" } },
      update: data,
      create: data,
    });
    ids[j.company] = job.id;
  }
  return ids;
}

async function seedPopulated(userId: string, email: string, firstName: string, lastName: string, jobs: Record<string, string>) {
  await prisma.cVProfile.create({
    data: { userId, firstName, lastName, email, city: "Milano", title: "Product Designer",
      summary: "Product designer con 5 anni di esperienza su prodotti consumer e B2B: design system, user research e prototipazione rapida.",
      experiencesJson: JSON.stringify([
        { role: "Senior Product Designer", company: "Startup Tech SRL", startDate: "2022", endDate: "oggi" },
        { role: "Product Designer", company: "Digital Agency", startDate: "2020", endDate: "2021" },
      ]),
      skillsJson: JSON.stringify([{ name: "Figma" }, { name: "User research" }, { name: "Design system" }, { name: "Prototipazione" }]) },
  });
  await prisma.cVDocument.create({
    data: { userId, originalFilename: `CV_${firstName}_${lastName}_2026.pdf`, storagePath: `/local/${rnd()}.pdf`,
      extractedText: `${firstName} ${lastName} — Product Designer`, createdAt: daysAgo(20) },
  });
  await prisma.userPreferences.create({
    data: { userId, autoApplyOn: true, autoApplyMode: "hybrid", dailyCap: 10, matchMin: 60,
      rolesJson: JSON.stringify(["Product Designer"]), locationsJson: JSON.stringify(["Milano", "Remoto"]) },
  });

  const delivered = async (company: string, d: number) => {
    const app = await prisma.application.create({
      data: { userId, jobId: jobs[company], portal: "email_recruiter", status: "success", submittedVia: "email_recruiter",
        submitConfirmation: "EMAIL_SENT", submittedAt: daysAgo(d), createdAt: daysAgo(d + 1), startedAt: daysAgo(d + 1), completedAt: daysAgo(d) },
    });
    await prisma.applicationEmailAttempt.create({
      data: { applicationId: app.id, attemptKey: rnd(), recipient: `jobs@${company.toLowerCase().replace(/\s/g, "")}.example`,
        providerEmailId: `prov_${rnd()}`, status: "delivered", acceptedAt: daysAgo(d), lastEventAt: daysAgo(d), lastEventType: "delivered" },
    });
    return app;
  };

  const reply = async (applicationId: string, kind: string, d: number, read: boolean, subject: string) => {
    await prisma.applicationReply.create({
      data: { applicationId, fromAddress: "talent@company.example", subject, kind, bodyText: subject, isHuman: true,
        receivedAt: daysAgo(d), attentionTrackedAt: daysAgo(d), readAt: read ? daysAgo(d - 0.5) : null, provider: "resend",
        providerMessageId: `msg_${rnd()}`, directRecipient: true },
    });
    await prisma.application.update({ where: { id: applicationId },
      data: { lastReplyKind: kind, lastReplyAt: daysAgo(d), replyCount: { increment: 1 }, ...(kind === "colloquio" ? { userStatus: "colloquio" } : {}) } });
  };

  // Older history: delivered sends across ~8 weeks, with a few recruiter replies.
  const wonderflow = await delivered("Wonderflow", 53);
  await delivered("Igloo", 47);
  const subito = await delivered("Subito", 44);
  await reply(subito.id, "rifiutata", 40, true, "Esito candidatura");
  const yoox = await delivered("Yoox", 38);
  await reply(yoox.id, "rifiutata", 33, true, "Aggiornamento sulla candidatura");
  const treatwell = await delivered("Treatwell", 31);
  await reply(treatwell.id, "colloquio", 25, true, "Primo colloquio");
  await delivered("Moneyfarm", 26);
  const casavo = await delivered("Casavo", 20);
  await reply(casavo.id, "risposta", 17, true, "Domanda sulla disponibilità");
  await delivered("Scalapay", 16);
  await delivered("Fabrick", 9);
  await reply(wonderflow.id, "rifiutata", 46, true, "Posizione chiusa");

  // Delivery-confirmed + interview invite (read)
  const satispay = await delivered("Satispay", 12);
  await prisma.applicationReply.create({
    data: { applicationId: satispay.id, fromAddress: "talent@satispay.example", subject: "Colloquio conoscitivo", kind: "colloquio",
      bodyText: "Ciao, ti va una call di 30 minuti la prossima settimana?", isHuman: true, receivedAt: daysAgo(8),
      attentionTrackedAt: daysAgo(8), readAt: daysAgo(7), provider: "resend", providerMessageId: `msg_${rnd()}`, directRecipient: true },
  });
  await prisma.application.update({ where: { id: satispay.id },
    data: { lastReplyKind: "colloquio", lastReplyAt: daysAgo(8), replyCount: 1, userStatus: "colloquio" } });

  // Delivery-confirmed + unread recruiter reply
  const bending = await delivered("Bending Spoons", 6);
  await prisma.applicationReply.create({
    data: { applicationId: bending.id, fromAddress: "hiring@bendingspoons.example", subject: "Domanda sul portfolio", kind: "risposta",
      bodyText: "Potresti condividere un case study in più?", isHuman: true, receivedAt: daysAgo(1),
      attentionTrackedAt: daysAgo(1), readAt: null, provider: "resend", providerMessageId: `msg_${rnd()}`, directRecipient: true },
  });
  await prisma.application.update({ where: { id: bending.id },
    data: { lastReplyKind: "risposta", lastReplyAt: daysAgo(1), replyCount: 1 } });

  // Delivery-confirmed, no reply
  await delivered("Credimi", 4);

  // Submitted but unverified (portal, no receipt)
  await prisma.application.create({
    data: { userId, jobId: jobs["Docebo"], portal: "portal_greenhouse", status: "success", submittedVia: "portal_greenhouse",
      createdAt: daysAgo(3), startedAt: daysAgo(3), completedAt: daysAgo(3) },
  });
  // Prepared, awaiting the user's approval
  await prisma.application.create({
    data: { userId, jobId: jobs["Prima"], portal: "email_recruiter", status: "awaiting_consent",
      cvDocxPath: "/local/cv_prima.docx", coverLetterText: "Gentile team Prima, ...", createdAt: daysAgo(2), startedAt: daysAgo(2) },
  });
  // Approved by the user, queued for sending
  await prisma.application.create({
    data: { userId, jobId: jobs["Musixmatch"], portal: "email_recruiter", status: "queued", consentGrantedAt: daysAgo(1),
      createdAt: daysAgo(1) },
  });
  // Being prepared
  await prisma.application.create({
    data: { userId, jobId: jobs["Tlon"], portal: "email_recruiter", status: "optimizing", createdAt: daysAgo(0.2), startedAt: daysAgo(0.2) },
  });
  // Failed (job closed)
  await prisma.application.create({
    data: { userId, jobId: jobs["Shopfully"], portal: "email_recruiter", status: "failed", submitConfirmation: "JOB_CLOSED",
      errorMessage: "L'annuncio non è più online.", createdAt: daysAgo(9), completedAt: daysAgo(9) },
  });
}

async function main() {
  const jobs = await seedJobs();
  const populated = await makeUser("test-dashboard@lavorai.test", "Marco Rossi");
  await seedPopulated(populated.id, populated.email, "Marco", "Rossi", jobs);
  const nonAdmin = await makeUser("test-nonadmin@lavorai.test", "Luca Verdi");
  await seedPopulated(nonAdmin.id, nonAdmin.email, "Luca", "Verdi", jobs);
  const empty = await makeUser("test-empty@lavorai.test", "Sofia Bianchi");
  console.log("Seeded:", { populated: populated.id, nonAdmin: nonAdmin.id, empty: empty.id, password: PASSWORD });
}

main().finally(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
