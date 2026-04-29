import { prisma } from "../src/lib/db";

async function main() {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: "umbertogeraci0@gmail.com" },
  });
  const sessions = await prisma.applicationSession.findMany({
    where: { userId: u.id, status: { in: ["active", "auto", "paused"] } },
    select: {
      id: true,
      title: true,
      status: true,
      sentCount: true,
      targetCount: true,
    },
  });
  console.log("\n=== ROUND ATTIVI ===");
  for (const s of sessions) {
    console.log(`  ${s.title} · ${s.status} · ${s.sentCount}/${s.targetCount}`);
  }

  const totalJobs = await prisma.job.count();
  console.log(`\n=== JOB POOL TOTALE: ${totalJobs} ===`);

  for (const s of sessions) {
    const t = s.title!;
    // Replicates auto-apply-cron query filter
    const matchesTitle = await prisma.job.count({
      where: {
        source: { in: ["greenhouse", "lever", "linkedin", "adzuna"] },
        OR: [
          { url: { contains: "boards.greenhouse.io" } },
          { url: { contains: "job-boards.greenhouse.io" } },
          { url: { contains: "jobs.lever.co" } },
          { url: { contains: "workable.com/j/" } },
          { url: { contains: "apply.workable.com" } },
          { url: { contains: "adzuna.it" } },
          { url: { contains: "adzuna.com" } },
        ],
        AND: [
          {
            title: { contains: t, mode: "insensitive" },
          },
        ],
      },
    });
    const eligible = await prisma.job.count({
      where: {
        source: { in: ["greenhouse", "lever", "linkedin", "adzuna"] },
        OR: [
          { url: { contains: "boards.greenhouse.io" } },
          { url: { contains: "job-boards.greenhouse.io" } },
          { url: { contains: "jobs.lever.co" } },
          { url: { contains: "workable.com/j/" } },
          { url: { contains: "apply.workable.com" } },
          { url: { contains: "adzuna.it" } },
          { url: { contains: "adzuna.com" } },
        ],
        AND: [{ title: { contains: t, mode: "insensitive" } }],
        NOT: { applications: { some: { userId: u.id } } },
      },
    });
    console.log(
      `  "${t}": ${matchesTitle} match titolo, ${eligible} non già candidati`,
    );
  }

  // Esistono davvero job recenti freschi?
  const recent = await prisma.job.count({
    where: { postedAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
  });
  console.log(`\nJobs postati negli ultimi 7 giorni: ${recent}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
