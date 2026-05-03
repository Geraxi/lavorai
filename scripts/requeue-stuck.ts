import { prisma } from "../src/lib/db";
import { enqueueApplication } from "../src/lib/application-queue";

async function main() {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: "umbertogeraci0@gmail.com" },
  });
  const stuck = await prisma.application.findMany({
    where: {
      userId: u.id,
      status: { in: ["queued", "optimizing", "applying"] },
    },
    select: { id: true, status: true, createdAt: true, job: { select: { title: true, company: true } } },
    orderBy: { createdAt: "desc" },
  });
  console.log(`Stuck: ${stuck.length}`);
  for (const a of stuck) {
    console.log(`  ${a.status}  ${a.job.title} @ ${a.job.company}`);
    await prisma.application.update({
      where: { id: a.id },
      data: { status: "queued", startedAt: null, errorMessage: null },
    });
    await enqueueApplication(a.id);
  }
  console.log(`Re-enqueued: ${stuck.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
