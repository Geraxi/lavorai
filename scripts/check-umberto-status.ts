import { prisma } from "../src/lib/db";
async function main() {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: "umbertogeraci0@gmail.com" },
    include: { preferences: true },
  });
  console.log(`mode=${u.preferences?.autoApplyMode} dailyCap=${u.preferences?.dailyCap} matchMin=${u.preferences?.matchMin}`);
  const since = new Date(Date.now() - 24*3600_000);
  const apps = await prisma.application.findMany({
    where: { userId: u.id, createdAt: { gte: since } },
    include: { job: { select: { title: true, company: true, source: true } } },
    orderBy: { createdAt: "desc" },
  });
  console.log(`\n${apps.length} apps in last 24h:`);
  const byStatus: Record<string, number> = {};
  for (const a of apps) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
  console.log("status counts:", byStatus);
  for (const a of apps.slice(0, 15)) {
    console.log(`  ${a.createdAt.toISOString()} [${a.job.source}] ${a.status}${a.submittedVia ? "/"+a.submittedVia : ""} — "${a.job.title}" @ ${a.job.company}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
