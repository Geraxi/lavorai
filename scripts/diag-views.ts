import { prisma } from "../src/lib/db";

async function main() {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: "umbertogeraci0@gmail.com" },
  });
  const all = await prisma.application.findMany({
    where: { userId: u.id, status: "success", submittedVia: { not: null } },
    select: {
      submittedVia: true,
      viewedAt: true,
      createdAt: true,
      job: { select: { title: true, company: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const viewed = all.filter((a) => a.viewedAt);
  const byChan: Record<string, { total: number; viewed: number }> = {};
  for (const a of all) {
    const k = a.submittedVia ?? "unknown";
    byChan[k] = byChan[k] ?? { total: 0, viewed: 0 };
    byChan[k].total++;
    if (a.viewedAt) byChan[k].viewed++;
  }
  console.log(`Inviate totali: ${all.length}`);
  console.log(`Aperte (viewedAt set): ${viewed.length}`);
  console.log("");
  console.log("Per canale:");
  for (const [k, v] of Object.entries(byChan)) {
    console.log(`  ${k}: ${v.viewed} aperte / ${v.total} inviate`);
  }
  if (viewed.length > 0) {
    console.log("\nDettaglio aperture:");
    for (const a of viewed) {
      console.log(`  ${a.viewedAt!.toISOString().slice(0, 16)}  ${a.job.title} @ ${a.job.company}  (via ${a.submittedVia})`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
