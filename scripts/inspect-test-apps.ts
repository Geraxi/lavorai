import { prisma } from "../src/lib/db";

async function main() {
  const apps = await prisma.application.findMany({
    where: { id: { in: ["cmoasxpi90001i8h5c77c19nn", "cmoasztp60001i8irr0mf3sbc"] } },
    include: { job: { select: { title: true, company: true, source: true, url: true } } },
  });
  for (const a of apps) {
    console.log(`${a.id}`);
    console.log(`  job: "${a.job.title}" @ ${a.job.company} [${a.job.source}]`);
    console.log(`  status: ${a.status}`);
    console.log(`  submittedVia: ${a.submittedVia}`);
    console.log(`  completedAt: ${a.completedAt}`);
    console.log(`  error: ${a.errorMessage ?? "(none)"}`);
    console.log();
  }
}
main().finally(() => prisma.$disconnect());
