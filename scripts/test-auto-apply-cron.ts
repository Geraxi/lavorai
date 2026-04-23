import { runAutoApplyCron } from "../src/lib/auto-apply-cron";
import { prisma } from "../src/lib/db";

async function main() {
  console.log("🧪 Testing auto-apply cron against prod DB + Redis\n");

  // Setta Umberto in mode="auto" se non lo è già (è whitelist Pro+)
  const user = await prisma.user.findUnique({
    where: { email: "umbertogeraci0@gmail.com" },
    include: { preferences: true },
  });
  if (!user) throw new Error("user not found");
  console.log(`user: ${user.id} / tier=${user.tier}`);
  console.log(`prefs: ${JSON.stringify(user.preferences, null, 2).slice(0, 300)}`);

  // Forza mode="auto" per questo test, salva original per ripristino
  const originalMode = user.preferences?.autoApplyMode ?? "manual";
  if (originalMode !== "auto") {
    await prisma.userPreferences.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        autoApplyMode: "auto",
        autoApplyOn: true,
      },
      update: { autoApplyMode: "auto", autoApplyOn: true },
    });
    console.log(`→ temporarily set autoApplyMode=auto (was ${originalMode})\n`);
  }

  const t0 = Date.now();
  const stats = await runAutoApplyCron();
  const ms = Date.now() - t0;
  console.log(`\nrun completed in ${ms}ms:`);
  console.log(JSON.stringify(stats, null, 2));

  // Ripristina mode originale
  if (originalMode !== "auto") {
    await prisma.userPreferences.update({
      where: { userId: user.id },
      data: { autoApplyMode: originalMode },
    });
    console.log(`\n→ restored autoApplyMode=${originalMode}`);
  }

  // Mostra le nuove applications create
  const newApps = await prisma.application.findMany({
    where: { userId: user.id, createdAt: { gte: new Date(Date.now() - ms - 5000) } },
    include: { job: { select: { title: true, company: true, source: true } } },
    orderBy: { createdAt: "desc" },
  });
  console.log(`\n${newApps.length} new applications just created:`);
  for (const a of newApps.slice(0, 10)) {
    console.log(`  [${a.job.source}] ${a.status} → "${a.job.title}" @ ${a.job.company}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
