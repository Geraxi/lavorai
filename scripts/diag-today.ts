import { prisma } from "../src/lib/db";
async function main() {
  const u = await prisma.user.findUniqueOrThrow({ where: { email: "umbertogeraci0@gmail.com" } });
  const start = new Date(); start.setUTCHours(0,0,0,0);
  const today = await prisma.application.groupBy({
    by: ["status"],
    where: { userId: u.id, createdAt: { gte: start } },
    _count: true,
  });
  console.log("=== today by status ==="); console.table(today);
  const last = await prisma.application.findMany({
    where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 12,
    select: { status: true, createdAt: true, errorMessage: true, submittedVia: true, job: { select: { title: true, company: true } } },
  });
  console.log("=== last 12 ===");
  for (const a of last) console.log(a.createdAt.toISOString(), a.status, "via", a.submittedVia ?? "-", "·", a.job?.title, "@", a.job?.company, a.errorMessage ? `[${a.errorMessage.slice(0,60)}]` : "");
}
main().catch(e=>{console.error(e);process.exit(1);}).finally(()=>process.exit(0));
