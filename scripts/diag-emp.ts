import { prisma } from "../src/lib/db";

async function main() {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: "umbertogeraci0@gmail.com" },
    include: { preferences: true },
  });
  console.log("employmentType:", u.preferences?.employmentType ?? "(default employee)");
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
