import { prisma } from "../src/lib/db";

async function main() {
  const jobs = await prisma.job.findMany({
    where: { recruiterEmail: { not: null } },
    orderBy: { cachedAt: "desc" },
    take: 30,
    select: { title: true, company: true, recruiterEmail: true, url: true },
  });
  for (const j of jobs) {
    console.log(`${j.recruiterEmail}  ← "${j.title}" @ ${j.company ?? "—"}`);
  }
  console.log(`\nTotal jobs with recruiter email: ${jobs.length}`);

  // Conteggio per dominio per capire se è tutto Adzuna ecc.
  const counts: Record<string, number> = {};
  for (const j of jobs) {
    const domain = j.recruiterEmail?.split("@")[1] ?? "?";
    counts[domain] = (counts[domain] ?? 0) + 1;
  }
  console.log("\nBy domain:");
  for (const [d, c] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${d}: ${c}`);
  }
}

main().finally(() => prisma.$disconnect());
