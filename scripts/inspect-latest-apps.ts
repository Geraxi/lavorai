import { prisma } from "../src/lib/db";

async function main() {
  const apps = await prisma.application.findMany({
    orderBy: { createdAt: "desc" },
    take: 15,
    include: {
      job: { select: { title: true, company: true, url: true, source: true } },
    },
  });
  for (const a of apps) {
    console.log(
      `${a.id}  status=${a.status}  submittedVia=${a.submittedVia ?? "null"}`,
    );
    console.log(`  job: "${a.job.title}" @ ${a.job.company ?? "—"} [${a.job.source}]`);
    console.log(`  url: ${a.job.url}`);
    if (a.errorMessage) console.log(`  err: ${a.errorMessage.slice(0, 120)}`);
    console.log("");
  }
}

main().finally(() => prisma.$disconnect());
