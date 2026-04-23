import { prisma } from "../src/lib/db";

async function main() {
  // Breakdown per status + submittedVia
  const apps = await prisma.application.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      status: true,
      submittedVia: true,
      createdAt: true,
      job: { select: { recruiterEmail: true } },
    },
  });

  const combo: Record<string, number> = {};
  for (const a of apps) {
    const key = `${a.status} · via=${a.submittedVia ?? "null"} · recruiter=${a.job.recruiterEmail ? "yes" : "no"}`;
    combo[key] = (combo[key] ?? 0) + 1;
  }
  console.log(`Ultimi ${apps.length} applications:\n`);
  for (const [k, v] of Object.entries(combo).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.toString().padStart(3)} × ${k}`);
  }
}

main().finally(() => prisma.$disconnect());
