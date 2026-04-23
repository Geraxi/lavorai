import { prisma } from "../src/lib/db";

async function main() {
  const ats = await prisma.job.findMany({
    where: { source: { in: ["greenhouse", "lever"] } },
    orderBy: [{ source: "asc" }, { postedAt: "desc" }],
    take: 15,
    select: { id: true, source: true, title: true, company: true, location: true, url: true },
  });
  console.log("Job direttamente submittable (Greenhouse/Lever):\n");
  for (const j of ats) {
    console.log(`  [${j.source}] ${j.title} @ ${j.company ?? "—"} · ${j.location ?? "—"}`);
    console.log(`           ${j.url}`);
    console.log(`           app URL: https://lavorai.it/jobs/${j.id}`);
    console.log();
  }
}
main().finally(() => prisma.$disconnect());
