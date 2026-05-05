import { prisma } from "../src/lib/db";

async function main() {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: "umbertogeraci0@gmail.com" },
  });
  await prisma.userPreferences.upsert({
    where: { userId: u.id },
    create: { userId: u.id, employmentType: "both" },
    update: { employmentType: "both" },
  });
  console.log("employmentType set to: both");
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
