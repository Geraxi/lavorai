import { prisma } from "../src/lib/db";

async function main() {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: "umbertogeraci0@gmail.com" },
  });
  const all = await prisma.application.findMany({
    where: { userId: u.id },
    select: {
      id: true,
      status: true,
      submittedVia: true,
      createdAt: true,
      job: { select: { title: true, company: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const by: Record<string, number> = {};
  let delivered = 0;
  let deliveredToday = 0;
  let ready = 0;
  let readyToday = 0;
  for (const a of all) {
    by[a.status] = (by[a.status] ?? 0) + 1;
    if (a.status === "success" && a.submittedVia) {
      delivered++;
      if (a.createdAt >= todayStart) deliveredToday++;
    }
    if (a.status === "ready_to_apply") {
      ready++;
      if (a.createdAt >= todayStart) readyToday++;
    }
  }

  console.log(`Total apps: ${all.length}`);
  console.log("By status:", by);
  console.log("");
  console.log(`INVIATE DAVVERO (success+submittedVia): ${delivered} (oggi: ${deliveredToday})`);
  console.log(`CV PRONTO non consegnato (ready_to_apply): ${ready} (oggi: ${readyToday})`);
  console.log("");
  console.log("=== Ultime 10 ===");
  for (const a of all.slice(0, 10)) {
    const tag =
      a.status === "success" && a.submittedVia
        ? `✅ INVIATA via ${a.submittedVia}`
        : a.status === "ready_to_apply"
          ? "📄 CV pronto ma NON consegnata"
          : `⏳ ${a.status}`;
    console.log(
      `  ${a.createdAt.toISOString().slice(0, 16)}  ${tag}  "${a.job.title.slice(0, 45)}" @ ${a.job.company}`,
    );
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
