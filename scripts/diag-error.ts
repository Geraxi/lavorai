import { prisma } from "../src/lib/db";
async function main() {
  const a = await prisma.application.findFirst({
    where: { status: "failed" }, orderBy: { createdAt: "desc" },
    select: { errorMessage: true, job: { select: { title: true } } },
  });
  console.log(a?.job?.title);
  console.log(a?.errorMessage);
}
main().finally(()=>process.exit(0));
