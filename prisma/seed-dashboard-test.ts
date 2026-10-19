/**
 * Dashboard Redesign Test Seed
 * 
 * Creates realistic test data for dashboard development and testing:
 * - Test user with complete profile
 * - Realistic job opportunities (30d cache window)
 * - Applications in various lifecycle stages
 * - Recruiter replies (interview invites, rejections, inquiries)
 * - Gmail messages
 * - User preferences and CV profile
 * 
 * Run: NODE_ENV=test npx tsx prisma/seed-dashboard-test.ts
 * 
 * SAFETY: Only runs if DATABASE_URL contains "test" or "dev.db"
 */

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const prisma = new PrismaClient();

const TEST_USER_EMAIL = "test-dashboard@lavorai.test";
const NOW = new Date();
const DAYS_AGO = (d: number) => new Date(NOW.getTime() - d * 86400_000);

// Safety check: only run on test/dev database
function assertTestDatabase() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!dbUrl.includes("test") && !dbUrl.includes("dev.db")) {
    throw new Error("❌ Refusing to seed: DATABASE_URL must contain 'test' or 'dev.db'");
  }
  console.log("✅ Test database detected:", dbUrl.slice(0, 30) + "...");
}

async function main() {
  assertTestDatabase();

  console.log("\n🌱 Seeding dashboard test data...\n");

  // 1. Create test user with complete profile
  const user = await prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    update: {},
    create: {
      email: TEST_USER_EMAIL,
      name: "Marco Rossi",
      tier: "pro",
      stripeCustomerId: "cus_test_dashboard",
      stripeSubscriptionId: "sub_test_dashboard",
      stripePriceId: "price_test_pro",
      subscriptionStatus: "active",
      currentPeriodEnd: new Date(NOW.getTime() + 30 * 86400_000), // 30d future
      emailVerified: DAYS_AGO(30),
      onboardedAt: DAYS_AGO(28),
      welcomeSeenAt: DAYS_AGO(30),
      lastLoginAt: DAYS_AGO(1),
      privacyConsentAt: DAYS_AGO(30),
      seniority: "mid",
      yearsExperience: 5,
      englishLevel: "b2",
      italianNative: true,
      euAuthorized: true,
      locale: "it",
    },
  });
  console.log(`👤 Test user: ${user.email} (${user.id})`);

  // 2. Create CV profile
  await prisma.cVProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      firstName: "Marco",
      lastName: "Rossi",
      email: TEST_USER_EMAIL,
      phone: "+39 333 1234567",
      city: "Milano",
      title: "Product Designer",
      summary: "Product designer con 5 anni di esperienza su prodotti consumer e B2B. Specializzato in design systems, user research e prototipazione rapida. Ho lavorato con team remoti in startup e scale-up.",
      experiencesJson: JSON.stringify([
        {
          role: "Senior Product Designer",
          company: "Startup Tech SRL",
          startDate: "2022-01",
          endDate: null,
          current: true,
          description: "Lead design del redesign dell'app mobile (100k+ utenti). Creazione design system da zero. User research e usability testing settimanali.",
        },
        {
          role: "Product Designer",
          company: "Digital Agency",
          startDate: "2020-03",
          endDate: "2021-12",
          current: false,
          description: "Design di interfacce web e mobile per clienti B2C. Progetti: e-commerce fashion, app fintech, dashboard analytics.",
        },
        {
          role: "Junior UI Designer",
          company: "Freelance",
          startDate: "2018-06",
          endDate: "2020-02",
          current: false,
          description: "Progetti freelance per PMI: landing pages, branding, UI kit. Collaborazione con sviluppatori frontend.",
        },
      ]),
      educationJson: JSON.stringify([
        {
          degree: "Laurea Magistrale in Design della Comunicazione",
          institution: "Politecnico di Milano",
          startDate: "2016-09",
          endDate: "2018-07",
          grade: "110/110",
        },
      ]),
      skillsJson: JSON.stringify([
        { name: "Figma", level: "expert" },
        { name: "User Research", level: "advanced" },
        { name: "Prototyping", level: "advanced" },
        { name: "Design Systems", level: "advanced" },
        { name: "HTML/CSS", level: "intermediate" },
        { name: "React (basics)", level: "beginner" },
      ]),
      languagesJson: JSON.stringify([
        { name: "Italiano", level: "native" },
        { name: "Inglese", level: "b2" },
      ]),
      linksJson: JSON.stringify([
        { label: "Portfolio", url: "https://marcorossi.design" },
        { label: "LinkedIn", url: "https://linkedin.com/in/marcorossi" },
      ]),
    },
  });
  console.log("📄 CV profile created");

  // 3. Create CV document (simulated upload)
  await prisma.cVDocument.upsert({
    where: { id: "cv_test_dashboard" },
    update: {},
    create: {
      id: "cv_test_dashboard",
      userId: user.id,
      originalFilename: "CV_Marco_Rossi_2026.pdf",
      storagePath: "/test/cv_test_dashboard.pdf",
      extractedText: "Marco Rossi | Product Designer | Milano\n\nSenior Product Designer con 5 anni di esperienza...",
      createdAt: DAYS_AGO(28),
    },
  });
  console.log("📎 CV document created");

  // 4. Create user preferences
  await prisma.userPreferences.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      autoApplyOn: true,
      autoApplyMode: "auto",
      dailyCap: 10,
      matchMin: 60,
      salaryMin: 35000,
      employmentType: "employee",
      rolesJson: JSON.stringify(["Product Designer", "UX Designer", "UI Designer"]),
      locationsJson: JSON.stringify(["Milano", "Roma", "Remoto"]),
      sourcesJson: JSON.stringify(["linkedin", "indeed", "infojobs"]),
    },
  });
  console.log("⚙️  User preferences created");

  // 5. Create realistic jobs (30d cache window)
  const jobs = [
    // Open opportunities (should appear on globe)
    {
      externalId: "seed-dash-1",
      source: "adzuna",
      title: "Senior Product Designer",
      company: "Satispay",
      location: "Milano, Italia",
      description: "Cerchiamo un Senior Product Designer per guidare il redesign dell'app di pagamenti (2M+ utenti). Stack: Figma, design systems, user research, A/B testing. Collaborerai con PM, engineers e data analysts.\n\nRequisiti:\n- 4+ anni esperienza product design\n- Portfolio con case studies\n- Esperienza design systems\n- User research e usability testing\n- Inglese fluente (team internazionale)\n\nOttimo se hai:\n- Esperienza fintech\n- Conoscenza HTML/CSS\n- Background in psicologia o HCI",
      url: "https://jobs.satispay.com/senior-product-designer",
      contractType: "permanent",
      remote: false,
      salaryMin: 45000,
      salaryMax: 65000,
      category: "design",
      postedAt: DAYS_AGO(5),
      cachedAt: DAYS_AGO(2),
      recruiterEmail: "hiring@satispay.com",
      recruiterScrapedAt: DAYS_AGO(2),
    },
    {
      externalId: "seed-dash-2",
      source: "adzuna",
      title: "Product Designer",
      company: "Bending Spoons",
      location: "Milano, Italia",
      description: "Product designer su app consumer ad alta scala (Evernote, Meetup, Splice, 30M+ users combined). Design end-to-end: ricerca, ideazione, prototipazione, testing, delivery.\n\nCosa farai:\n- Ownership completa di product areas\n- User research qualitativa e quantitativa\n- Collaborazione con PM, engineers, data\n- A/B testing e feature rollout\n\nCerchiamo:\n- 3+ anni product design\n- Portfolio eccellente\n- Mindset data-driven\n- Autonomia e ownership\n- Inglese fluente",
      url: "https://bendingspoons.com/careers/product-designer",
      contractType: "permanent",
      remote: false,
      salaryMin: 50000,
      salaryMax: 75000,
      category: "design",
      postedAt: DAYS_AGO(10),
      cachedAt: DAYS_AGO(1),
      recruiterEmail: "talent@bendingspoons.com",
      recruiterScrapedAt: DAYS_AGO(1),
    },
    {
      externalId: "seed-dash-3",
      source: "adzuna",
      title: "UX/UI Designer",
      company: "Credimi",
      location: "Milano, Italia",
      description: "UX/UI Designer per piattaforma fintech B2B (invoice financing per PMI). Design di dashboard complesse, onboarding, KYC flows.\n\nStack:\n- Figma per design e prototyping\n- Design system esistente da evolvere\n- Collaborazione con dev team React\n\nRequisiti:\n- 2+ anni esperienza UX/UI\n- Portfolio con dashboard/B2B\n- User research e testing\n- Conoscenza Figma avanzata",
      url: "https://credimi.com/jobs/ux-ui-designer",
      contractType: "permanent",
      remote: true,
      salaryMin: 35000,
      salaryMax: 50000,
      category: "design",
      postedAt: DAYS_AGO(3),
      cachedAt: DAYS_AGO(1),
      recruiterEmail: "jobs@credimi.com",
      recruiterScrapedAt: DAYS_AGO(1),
    },
    {
      externalId: "seed-dash-4",
      source: "adzuna",
      title: "Senior UX Designer",
      company: "Docebo",
      location: "Milano, Italia",
      description: "Senior UX Designer per piattaforma e-learning SaaS (clienti Fortune 500). Design di user flows complessi per LMS, analytics, admin panels.\n\nRequisiti:\n- 5+ anni UX design\n- Esperienza B2B SaaS\n- User research e testing\n- Design systems\n- Inglese fluente (team globale)",
      url: "https://docebo.com/careers/senior-ux-designer-milan",
      contractType: "permanent",
      remote: true,
      salaryMin: 48000,
      salaryMax: 68000,
      category: "design",
      postedAt: DAYS_AGO(7),
      cachedAt: DAYS_AGO(1),
    },
    {
      externalId: "seed-dash-5",
      source: "adzuna",
      title: "Product Designer (Remote)",
      company: "Prima",
      location: "Remoto, Italia",
      description: "Product designer per insurtech in forte crescita. Design di app mobile e web per assicurazioni auto, casa, salute.\n\nCosa cerchiamo:\n- 3+ anni product design\n- Esperienza mobile-first\n- User research\n- Collaborazione con PM e engineers\n- Full remote (team distribuito EU)",
      url: "https://prima.it/jobs/product-designer-remote",
      contractType: "permanent",
      remote: true,
      salaryMin: 40000,
      salaryMax: 58000,
      category: "design",
      postedAt: DAYS_AGO(12),
      cachedAt: DAYS_AGO(3),
      recruiterEmail: "talent@prima.it",
    },
    // Rome opportunity
    {
      externalId: "seed-dash-6",
      source: "adzuna",
      title: "Lead Product Designer",
      company: "Tlon",
      location: "Roma, Italia",
      description: "Lead product designer per piattaforma social (community-driven). Guiderai il design team (2 designers) e collaborerai con founders.\n\nRequisiti:\n- 6+ anni product design\n- Esperienza leadership (2+ direct reports)\n- Portfolio eccellente con progetti social/community\n- Design systems e component libraries",
      url: "https://tlon.it/jobs/lead-product-designer",
      contractType: "permanent",
      remote: false,
      salaryMin: 50000,
      salaryMax: 70000,
      category: "design",
      postedAt: DAYS_AGO(15),
      cachedAt: DAYS_AGO(4),
    },
    // Closed job (should NOT appear on globe)
    {
      externalId: "seed-dash-closed",
      source: "adzuna",
      title: "Product Designer",
      company: "Shopfully",
      location: "Milano, Italia",
      description: "Position filled.",
      url: "https://shopfully.com/jobs/product-designer",
      contractType: "permanent",
      remote: false,
      category: "design",
      postedAt: DAYS_AGO(45),
      cachedAt: DAYS_AGO(30),
      closedAt: DAYS_AGO(10),
    },
  ];

  for (const j of jobs) {
    await prisma.job.upsert({
      where: { externalId_source: { externalId: j.externalId, source: j.source } },
      update: j,
      create: j,
    });
  }
  console.log(`💼 ${jobs.length} jobs created (${jobs.filter(j => !j.closedAt).length} open)`);

  // 6. Create applications in various stages
  const dbJobs = await prisma.job.findMany({ where: { externalId: { startsWith: "seed-dash-" } } });
  
  // 6.1 Confirmed submitted (with verified ATS receipt)
  const satispayJob = dbJobs.find(j => j.company === "Satispay")!;
  const app1 = await prisma.application.create({
    data: {
      userId: user.id,
      jobId: satispayJob.id,
      portal: "email_recruiter",
      status: "success",
      submittedVia: "email_recruiter",
      submitConfirmation: "EMAIL_SENT",
      submissionReceiptJson: null, // Will add email attempt
      cvDocxPath: "/test/cv_satispay.docx",
      cvPdfPath: "/test/cv_satispay.pdf",
      coverLetterPath: "/test/cover_satispay.docx",
      coverLetterText: "Gentile team Satispay,\n\nSono entusiasta di candidarmi per la posizione di Senior Product Designer...",
      cvLanguage: "it",
      submittedAt: DAYS_AGO(14),
      createdAt: DAYS_AGO(15),
      startedAt: DAYS_AGO(15),
      completedAt: DAYS_AGO(14),
    },
  });
  // Add email attempt with delivery confirmation
  await prisma.applicationEmailAttempt.create({
    data: {
      applicationId: app1.id,
      attemptKey: crypto.randomBytes(16).toString("hex"),
      recipient: "hiring@satispay.com",
      providerEmailId: `prov_${crypto.randomBytes(8).toString("hex")}`,
      status: "delivered",
      acceptedAt: DAYS_AGO(14),
      lastEventAt: DAYS_AGO(14),
      lastEventType: "delivered",
    },
  });
  // Add interview invite reply
  await prisma.applicationReply.create({
    data: {
      applicationId: app1.id,
      fromAddress: "lucia.bianchi@satispay.com",
      subject: "Re: Candidatura Product Designer - Colloquio",
      bodyText: "Ciao Marco,\n\nGrazie per la candidatura! Abbiamo visto il tuo portfolio e ci piacerebbe conoscerti.\n\nSei disponibile per una call conoscitiva la prossima settimana? Durata: 30 minuti, online.\n\nFammi sapere le tue disponibilità.\n\nLucia Bianchi\nTalent Acquisition | Satispay",
      kind: "colloquio",
      isHuman: true,
      receivedAt: DAYS_AGO(10),
      attentionTrackedAt: DAYS_AGO(10),
      readAt: DAYS_AGO(9), // User read it
      provider: "resend",
      providerMessageId: `msg_${crypto.randomBytes(8).toString("hex")}`,
      rfcMessageId: `<${crypto.randomBytes(16).toString("hex")}@satispay.com>`,
      replyToAddress: `reply+${app1.id}@inbound.lavorai.test`,
      directRecipient: true,
    },
  });
  await prisma.application.update({
    where: { id: app1.id },
    data: {
      lastReplyKind: "colloquio",
      lastReplyAt: DAYS_AGO(10),
      replyCount: 1,
      userStatus: "colloquio",
    },
  });
  console.log(`  ✅ App 1: Satispay (confirmed + interview invite)`);

  // 6.2 Confirmed submitted (no reply yet)
  const bendingSpoonsJob = dbJobs.find(j => j.company === "Bending Spoons")!;
  const app2 = await prisma.application.create({
    data: {
      userId: user.id,
      jobId: bendingSpoonsJob.id,
      portal: "email_recruiter",
      status: "success",
      submittedVia: "email_recruiter",
      submitConfirmation: "EMAIL_SENT",
      cvDocxPath: "/test/cv_bending.docx",
      cvPdfPath: "/test/cv_bending.pdf",
      coverLetterPath: "/test/cover_bending.docx",
      coverLetterText: "Dear Bending Spoons team,\n\nI'm excited to apply for the Product Designer position...",
      cvLanguage: "en",
      submittedAt: DAYS_AGO(7),
      createdAt: DAYS_AGO(8),
      startedAt: DAYS_AGO(8),
      completedAt: DAYS_AGO(7),
    },
  });
  await prisma.applicationEmailAttempt.create({
    data: {
      applicationId: app2.id,
      attemptKey: crypto.randomBytes(16).toString("hex"),
      recipient: "talent@bendingspoons.com",
      providerEmailId: `prov_${crypto.randomBytes(8).toString("hex")}`,
      status: "delivered",
      acceptedAt: DAYS_AGO(7),
      lastEventAt: DAYS_AGO(7),
      lastEventType: "delivered",
    },
  });
  console.log(`  ✅ App 2: Bending Spoons (confirmed, no reply)`);

  // 6.3 Confirmed submitted + rejection
  const credicimiJob = dbJobs.find(j => j.company === "Credimi")!;
  const app3 = await prisma.application.create({
    data: {
      userId: user.id,
      jobId: credicimiJob.id,
      portal: "email_recruiter",
      status: "success",
      submittedVia: "email_recruiter",
      cvDocxPath: "/test/cv_credimi.docx",
      coverLetterPath: "/test/cover_credimi.docx",
      cvLanguage: "it",
      submittedAt: DAYS_AGO(20),
      createdAt: DAYS_AGO(21),
      startedAt: DAYS_AGO(21),
      completedAt: DAYS_AGO(20),
    },
  });
  await prisma.applicationEmailAttempt.create({
    data: {
      applicationId: app3.id,
      attemptKey: crypto.randomBytes(16).toString("hex"),
      recipient: "jobs@credimi.com",
      providerEmailId: `prov_${crypto.randomBytes(8).toString("hex")}`,
      status: "delivered",
      acceptedAt: DAYS_AGO(20),
      lastEventAt: DAYS_AGO(20),
      lastEventType: "delivered",
    },
  });
  await prisma.applicationReply.create({
    data: {
      applicationId: app3.id,
      fromAddress: "noreply@credimi.com",
      subject: "Re: Candidatura UX/UI Designer",
      bodyText: "Gentile Marco,\n\nGrazie per l'interesse verso Credimi. Dopo attenta valutazione, abbiamo deciso di proseguire con altri candidati il cui profilo è più in linea con le necessità del ruolo.\n\nTi auguriamo il meglio per la tua ricerca.\n\nTeam HR | Credimi",
      kind: "rifiutata",
      isHuman: true,
      receivedAt: DAYS_AGO(17),
      attentionTrackedAt: DAYS_AGO(17),
      readAt: DAYS_AGO(16),
      provider: "resend",
      providerMessageId: `msg_${crypto.randomBytes(8).toString("hex")}`,
      directRecipient: true,
    },
  });
  await prisma.application.update({
    where: { id: app3.id },
    data: { lastReplyKind: "rifiutata", lastReplyAt: DAYS_AGO(17), replyCount: 1 },
  });
  console.log(`  ✅ App 3: Credimi (confirmed + rejection)`);

  // 6.4 Submitted unverified (no receipt)
  const doceboJob = dbJobs.find(j => j.company === "Docebo")!;
  await prisma.application.create({
    data: {
      userId: user.id,
      jobId: doceboJob.id,
      portal: "portal_greenhouse",
      status: "success",
      submittedVia: "portal_greenhouse",
      submitConfirmation: "UNCONFIRMED", // No receipt captured
      cvDocxPath: "/test/cv_docebo.docx",
      coverLetterPath: "/test/cover_docebo.docx",
      cvLanguage: "en",
      submittedAt: null, // Not confirmed
      createdAt: DAYS_AGO(5),
      startedAt: DAYS_AGO(5),
      completedAt: DAYS_AGO(5),
    },
  });
  console.log(`  ⚠️  App 4: Docebo (unverified, no receipt)`);

  // 6.5 Awaiting approval (hybrid mode)
  const primaJob = dbJobs.find(j => j.company === "Prima")!;
  await prisma.application.create({
    data: {
      userId: user.id,
      jobId: primaJob.id,
      portal: "email_recruiter",
      status: "awaiting_consent",
      cvDocxPath: "/test/cv_prima.docx",
      coverLetterPath: "/test/cover_prima.docx",
      cvLanguage: "it",
      createdAt: DAYS_AGO(2),
      startedAt: DAYS_AGO(2),
    },
  });
  console.log(`  ⏳ App 5: Prima (awaiting approval)`);

  // 6.6 Preparing (in queue)
  const tlonJob = dbJobs.find(j => j.company === "Tlon")!;
  await prisma.application.create({
    data: {
      userId: user.id,
      jobId: tlonJob.id,
      portal: "email_recruiter",
      status: "optimizing",
      createdAt: DAYS_AGO(1),
      startedAt: DAYS_AGO(1),
    },
  });
  console.log(`  ⏳ App 6: Tlon (optimizing CV)`);

  // 6.7 Failed (job closed)
  const closedJob = dbJobs.find(j => j.company === "Shopfully")!;
  await prisma.application.create({
    data: {
      userId: user.id,
      jobId: closedJob.id,
      portal: "email_recruiter",
      status: "failed",
      submitConfirmation: "JOB_CLOSED",
      errorMessage: "L'annuncio non è più online.",
      createdAt: DAYS_AGO(10),
      completedAt: DAYS_AGO(10),
    },
  });
  console.log(`  ❌ App 7: Shopfully (failed, job closed)`);

  console.log(`\n📊 Applications created: 7 total`);
  console.log(`   - Confirmed submissions: 3`);
  console.log(`   - Unverified: 1`);
  console.log(`   - Awaiting approval: 1`);
  console.log(`   - Preparing: 1`);
  console.log(`   - Failed: 1`);

  // 7. Add one more unread recruiter message (generic inquiry)
  const app1Reload = await prisma.application.findUnique({ where: { id: app1.id } });
  if (app1Reload) {
    await prisma.applicationReply.create({
      data: {
        applicationId: app1Reload.id,
        fromAddress: "maria.verdi@satispay.com",
        subject: "Domanda sul portfolio",
        bodyText: "Ciao Marco,\n\nHo visto il tuo case study sul redesign mobile. Potresti condividere qualche dettaglio in più sul processo di user research?\n\nMaria\nLead Designer | Satispay",
        kind: "risposta",
        isHuman: true,
        receivedAt: DAYS_AGO(2),
        attentionTrackedAt: DAYS_AGO(2),
        readAt: null, // UNREAD - should appear in attention queue
        provider: "resend",
        providerMessageId: `msg_${crypto.randomBytes(8).toString("hex")}`,
        directRecipient: true,
      },
    });
    await prisma.application.update({
      where: { id: app1Reload.id },
      data: { replyCount: 2, lastReplyAt: DAYS_AGO(2), lastReplyKind: "risposta" },
    });
    console.log(`   📨 Added unread message (should appear in attention queue)`);
  }

  // 8. Summary
  console.log(`\n✅ Dashboard test seed complete!\n`);
  console.log(`Test user credentials:`);
  console.log(`  Email: ${TEST_USER_EMAIL}`);
  console.log(`  Login: Use magic link (no password)`);
  console.log(`\nExpected dashboard state:`);
  console.log(`  - Invii confermati: 3`);
  console.log(`  - Con risposte recruiter: 3 (2 read, 1 unread)`);
  console.log(`  - Inviti a colloquio: 1`);
  console.log(`  - Offerte dichiarate: 0`);
  console.log(`  - Attention items: 2 (1 unread message, 1 awaiting approval)`);
  console.log(`  - Open opportunities: 6`);
  console.log(`  - Application stages:`);
  console.log(`    • Awaiting approval: 1`);
  console.log(`    • Preparing: 1`);
  console.log(`    • Sent: 3`);
  console.log(`    • Unverified: 1`);
  console.log(`    • Stopped: 1`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("\n❌ Seed failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
