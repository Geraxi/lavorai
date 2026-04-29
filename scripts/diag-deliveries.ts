import { prisma } from "../src/lib/db";

async function main() {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: "umbertogeraci0@gmail.com" },
  });

  const all = await prisma.application.findMany({
    where: {
      userId: u.id,
      status: "success",
      submittedVia: { not: null },
    },
    include: {
      job: { select: { title: true, company: true, source: true, url: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`\n=== ${all.length} candidature DELIVERED ===\n`);

  // Group by company
  const byCompany = new Map<string, number>();
  const bySubmittedVia = new Map<string, number>();
  for (const a of all) {
    const c = a.job.company ?? "?";
    byCompany.set(c, (byCompany.get(c) ?? 0) + 1);
    bySubmittedVia.set(a.submittedVia!, (bySubmittedVia.get(a.submittedVia!) ?? 0) + 1);
  }

  console.log("Per azienda:");
  const sorted = [...byCompany.entries()].sort((a, b) => b[1] - a[1]);
  for (const [c, n] of sorted) console.log(`  ${n.toString().padStart(3)}× ${c}`);

  console.log("\nPer canale:");
  for (const [v, n] of bySubmittedVia) console.log(`  ${n}× ${v}`);

  console.log("\nUltime 10 in ordine cronologico:");
  for (const a of all.slice(0, 10)) {
    console.log(
      `  ${a.createdAt.toISOString().slice(0, 19)} · ${a.submittedVia} · "${a.job.title.slice(0, 50)}" @ ${a.job.company}`,
    );
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => process.exit(0));
