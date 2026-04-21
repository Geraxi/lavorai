/**
 * Seed dev/demo: crea utente demo + qualche job mock in cache.
 *
 * Run: npx tsx prisma/seed.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "demo@lavorai.it" },
    update: {},
    create: { email: "demo@lavorai.it", name: "Demo User", tier: "free" },
  });
  console.log(`👤 User: ${user.email}`);

  const mockJobs = [
    {
      externalId: "seed-1",
      source: "mock",
      title: "Senior Product Designer",
      company: "Satispay",
      location: "Milano, Italia",
      description:
        "Cerchiamo un Senior Product Designer per guidare il redesign dell'app di pagamenti (2M+ utenti). Requisiti: Figma, design systems, user research.",
      url: "https://example.com/jobs/satispay-senior",
      contractType: "permanent",
      remote: false,
      salaryMin: 55000,
      salaryMax: 75000,
    },
    {
      externalId: "seed-2",
      source: "mock",
      title: "Full-Stack Developer — TypeScript",
      company: "Bending Spoons",
      location: "Milano, Italia",
      description:
        "Full-stack developer su prodotti consumer ad alta scala. Stack: TypeScript, React, Node.js, PostgreSQL. 3+ anni esperienza.",
      url: "https://example.com/jobs/bs-fullstack",
      contractType: "permanent",
      remote: false,
      salaryMin: 50000,
      salaryMax: 80000,
    },
  ];

  for (const j of mockJobs) {
    await prisma.job.upsert({
      where: { externalId_source: { externalId: j.externalId, source: j.source } },
      update: j,
      create: j,
    });
  }
  console.log(`💼 ${mockJobs.length} job seeded`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
