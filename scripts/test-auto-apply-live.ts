import { runAutoApplyCron } from "../src/lib/auto-apply-cron";
import { prisma } from "../src/lib/db";

async function main() {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: "umbertogeraci0@gmail.com" },
    include: { preferences: true },
  });
  const origMode = user.preferences?.autoApplyMode ?? "manual";
  const origCap = user.preferences?.dailyCap ?? 25;

  const origMatchMin = user.preferences?.matchMin ?? 75;
  console.log(`Forcing mode=auto + dailyCap=100 + matchMin=0 temporarily...`);
  await prisma.userPreferences.update({
    where: { userId: user.id },
    data: { autoApplyMode: "auto", dailyCap: 100, matchMin: 0 },
  });

  const stats = await runAutoApplyCron();
  console.log("stats:", JSON.stringify(stats, null, 2));

  const newApps = await prisma.application.findMany({
    where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 60_000) } },
    include: { job: { select: { title: true, company: true, source: true } } },
    orderBy: { createdAt: "desc" },
  });
  console.log(`\n${newApps.length} apps created in last 60s:`);
  for (const a of newApps) {
    console.log(`  [${a.job.source}] "${a.job.title}" @ ${a.job.company} · ${a.status}`);
  }

  console.log("\nRestoring prefs...");
  await prisma.userPreferences.update({
    where: { userId: user.id },
    data: { autoApplyMode: origMode, dailyCap: origCap, matchMin: origMatchMin },
  });
  console.log(`→ mode=${origMode} dailyCap=${origCap} matchMin=${origMatchMin}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
