/**
 * Additional Test Users for Dashboard Screenshots
 * - Empty user (new account, no applications)
 * - Non-admin user (populated, isAdmin=false)
 */

import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const NOW = new Date();
const DAYS_AGO = (d: number) => new Date(NOW.getTime() - d * 86400_000);

async function main() {
  console.log("\n🌱 Creating additional test users...\n");

  // 1. Empty user (new account, verified email, no data)
  const emptyPassword = await bcrypt.hash("test123", 10);
  const emptyUser = await prisma.user.upsert({
    where: { email: "test-empty@lavorai.test" },
    update: {},
    create: {
      email: "test-empty@lavorai.test",
      name: "Sofia Bianchi",
      passwordHash: emptyPassword,
      tier: "free",
      emailVerified: NOW, // Email verified
      onboardedAt: NOW,
      welcomeSeenAt: NOW,
      lastLoginAt: NOW,
      privacyConsentAt: NOW,
      locale: "it",
    },
  });
  console.log(`👤 Empty user: ${emptyUser.email} (${emptyUser.id})`);

  // 2. Non-admin populated user (same data as test-dashboard but isAdmin=false)
  const nonAdminPassword = await bcrypt.hash("test123", 10);
  const nonAdminUser = await prisma.user.upsert({
    where: { email: "test-nonadmin@lavorai.test" },
    update: {},
    create: {
      email: "test-nonadmin@lavorai.test",
      name: "Luca Verdi",
      passwordHash: nonAdminPassword,
      tier: "pro",
      stripeCustomerId: "cus_test_nonadmin",
      stripeSubscriptionId: "sub_test_nonadmin",
      stripePriceId: "price_test_pro",
      subscriptionStatus: "active",
      currentPeriodEnd: new Date(NOW.getTime() + 30 * 86400_000),
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
  console.log(`👤 Non-admin user: ${nonAdminUser.email} (${nonAdminUser.id})`);

  // Add some minimal data for non-admin user (so it's not empty)
  await prisma.cVProfile.upsert({
    where: { userId: nonAdminUser.id },
    update: {},
    create: {
      userId: nonAdminUser.id,
      firstName: "Luca",
      lastName: "Verdi",
      email: "test-nonadmin@lavorai.test",
      phone: "+39 333 9876543",
      city: "Roma",
      title: "Frontend Developer",
      summary: "Frontend developer con 5 anni di esperienza. React, TypeScript, Next.js.",
      experiencesJson: JSON.stringify([
        {
          role: "Senior Frontend Developer",
          company: "Tech Company",
          startDate: "2021-01",
          endDate: null,
          current: true,
          description: "React, TypeScript, Next.js development",
        },
      ]),
      educationJson: JSON.stringify([]),
      skillsJson: JSON.stringify([
        { name: "React", level: "expert" },
        { name: "TypeScript", level: "advanced" },
      ]),
      languagesJson: JSON.stringify([
        { name: "Italiano", level: "native" },
        { name: "Inglese", level: "b2" },
      ]),
      linksJson: JSON.stringify([]),
    },
  });

  await prisma.cVDocument.upsert({
    where: { id: "cv_test_nonadmin" },
    update: {},
    create: {
      id: "cv_test_nonadmin",
      userId: nonAdminUser.id,
      originalFilename: "CV_Luca_Verdi_2026.pdf",
      storagePath: "/test/cv_test_nonadmin.pdf",
      extractedText: "Luca Verdi | Frontend Developer | Roma",
      createdAt: DAYS_AGO(28),
    },
  });

  await prisma.userPreferences.upsert({
    where: { userId: nonAdminUser.id },
    update: {},
    create: {
      userId: nonAdminUser.id,
      autoApplyOn: true,
      autoApplyMode: "hybrid",
      dailyCap: 5,
      matchMin: 70,
      salaryMin: 40000,
      employmentType: "employee",
      rolesJson: JSON.stringify(["Frontend Developer", "Full Stack Developer"]),
      locationsJson: JSON.stringify(["Roma", "Milano", "Remoto"]),
      sourcesJson: JSON.stringify(["linkedin", "indeed"]),
    },
  });

  // Add 2 applications for non-admin user
  const jobs = await prisma.job.findMany({ take: 2 });
  if (jobs.length >= 2) {
    await prisma.application.create({
      data: {
        userId: nonAdminUser.id,
        jobId: jobs[0].id,
        portal: "email_recruiter",
        status: "success",
        submittedVia: "email_recruiter",
        submitConfirmation: "EMAIL_SENT",
        cvDocxPath: "/test/cv_nonadmin1.docx",
        cvPdfPath: "/test/cv_nonadmin1.pdf",
        cvLanguage: "it",
        submittedAt: DAYS_AGO(10),
        createdAt: DAYS_AGO(11),
        startedAt: DAYS_AGO(11),
        completedAt: DAYS_AGO(10),
      },
    });

    await prisma.application.create({
      data: {
        userId: nonAdminUser.id,
        jobId: jobs[1].id,
        portal: "email_recruiter",
        status: "awaiting_consent",
        cvDocxPath: "/test/cv_nonadmin2.docx",
        cvLanguage: "it",
        createdAt: DAYS_AGO(1),
        startedAt: DAYS_AGO(1),
      },
    });
  }

  console.log(`\n✅ Additional test users created!\n`);
  console.log(`Test credentials (all use password: test123):`);
  console.log(`  1. test-dashboard@lavorai.test - Populated user (Marco Rossi)`);
  console.log(`  2. test-empty@lavorai.test - Empty user (Sofia Bianchi)`);
  console.log(`  3. test-nonadmin@lavorai.test - Non-admin (Luca Verdi)`);
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
