import { prisma } from "../src/lib/db";

async function main() {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: "umbertogeraci0@gmail.com" },
  });
  const apps = await prisma.application.findMany({
    where: {
      userId: u.id,
      status: "ready_to_apply",
      job: { company: { contains: "SumUp", mode: "insensitive" } },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      portal: true,
      errorMessage: true,
      createdAt: true,
      job: { select: { title: true, url: true } },
    },
  });
  for (const a of apps) {
    console.log(`${a.createdAt.toISOString().slice(0, 16)}  ${a.job.title}`);
    console.log(`  url: ${a.job.url}`);
    console.log(`  portal: ${a.portal}`);
    console.log(`  err: ${(a.errorMessage ?? "(none)").slice(0, 200)}`);
    console.log("");
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
