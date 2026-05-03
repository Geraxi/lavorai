import { prisma } from "../src/lib/db";

async function main() {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: "umbertogeraci0@gmail.com" },
  });
  const since = new Date(Date.now() - 30 * 86400_000);

  // Same query as cron
  const recentRta = await prisma.application.findMany({
    where: {
      userId: u.id,
      status: "ready_to_apply",
      createdAt: { gte: since },
      job: {
        OR: [
          { url: { contains: "boards.greenhouse.io" } },
          { url: { contains: "job-boards.greenhouse.io" } },
          { url: { contains: "jobs.lever.co" } },
          { url: { contains: "workable.com/j/" } },
          { url: { contains: "apply.workable.com" } },
        ],
      },
    },
    select: { job: { select: { company: true, url: true } } },
  });

  const map = new Map<string, { count: number; sampleUrl: string }>();
  for (const r of recentRta) {
    const c = (r.job.company ?? "").toLowerCase();
    if (!c) continue;
    const cur = map.get(c) ?? { count: 0, sampleUrl: r.job.url };
    cur.count++;
    map.set(c, cur);
  }
  const sorted = [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  console.log(`Total RTA su ATS vanilla negli ultimi 30g: ${recentRta.length}`);
  console.log("\nPer company (>= 5 = blacklistate):");
  for (const [c, { count, sampleUrl }] of sorted) {
    const flag = count >= 5 ? "🚫" : "  ";
    console.log(`  ${flag} ${count}× ${c}  ${sampleUrl.slice(0, 60)}`);
  }

  // Quanti job product designer eligible per umberto?
  const eligibleAfterAll = await prisma.job.count({
    where: {
      source: { in: ["greenhouse", "lever", "linkedin"] },
      OR: [
        { url: { contains: "boards.greenhouse.io" } },
        { url: { contains: "job-boards.greenhouse.io" } },
        { url: { contains: "jobs.lever.co" } },
        { url: { contains: "workable.com/j/" } },
        { url: { contains: "apply.workable.com" } },
      ],
      AND: [{ title: { contains: "Product Designer", mode: "insensitive" } }],
      NOT: {
        applications: {
          some: {
            userId: u.id,
            OR: [
              { status: { in: ["success", "queued", "optimizing", "applying"] } },
              { createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
            ],
          },
        },
      },
    },
  });
  console.log(`\n"Product Designer" eligible (post-NOT): ${eligibleAfterAll}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
