import { prisma } from "../src/lib/db";

async function main() {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: "umbertogeraci0@gmail.com" },
    include: { cvProfile: true },
  });
  if (!u.cvProfile) throw new Error("no profile");
  await prisma.cVProfile.update({
    where: { userId: u.id },
    data: {
      email: u.email, // backfill account email into profile
    },
  });
  console.log(`Profile email set to: ${u.email}`);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
