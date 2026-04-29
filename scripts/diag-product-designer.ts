import { prisma } from "../src/lib/db";

async function main() {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: "umbertogeraci0@gmail.com" },
  });

  // Tutti i job che superano il filtro SQL (URL vanilla + source + title contains "Product Designer")
  const sqlMatch = await prisma.job.findMany({
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
      AND: [{ title: { contains: "Product Designer", mode: "insensitive" } }],
    },
    select: { id: true, title: true, company: true, postedAt: true },
    orderBy: { postedAt: "desc" },
    take: 100,
  });
  const eligible = await prisma.job.findMany({
    where: {
      source: { in: ["greenhouse", "lever", "linkedin", "adzuna"] },
      OR: [
        { url: { contains: "boards.greenhouse.io" } },
        { url: { contains: "job-boards.greenhouse.io" } },
        { url: { contains: "jobs.lever.co" } },
        { url: { contains: "workable.com/j/" } },
        { url: { contains: "apply.workable.com" } },
      ],
      AND: [{ title: { contains: "Product Designer", mode: "insensitive" } }],
      NOT: { applications: { some: { userId: u.id } } },
    },
    select: { id: true, title: true, company: true, postedAt: true },
    orderBy: { postedAt: "desc" },
    take: 100,
  });
  console.log(`SQL match (titolo contiene 'Product Designer'): ${sqlMatch.length}`);
  console.log(`Eligibili (NON già candidati): ${eligible.length}`);
  console.log("\nUltimi 10 eligibili:");
  for (const j of eligible.slice(0, 10)) {
    console.log(`  ${j.postedAt?.toISOString().slice(0, 10) ?? "?"} · "${j.title.slice(0, 50)}" @ ${j.company}`);
  }

  // Quanti Intercom in eligibili?
  const intercomCount = eligible.filter((j) => (j.company ?? "").toLowerCase() === "intercom").length;
  console.log(`\nDi cui Intercom: ${intercomCount}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
