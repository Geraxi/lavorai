import { prisma } from "../src/lib/db";
import { rowToProfile } from "../src/lib/cv-profile-types";

async function main() {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: "umbertogeraci0@gmail.com" },
    include: { cvProfile: true },
  });
  console.log("User account email:", u.email);
  if (!u.cvProfile) {
    console.log("CVProfile: MISSING");
    return;
  }
  const p = rowToProfile(u.cvProfile);
  console.log("Profile firstName:", p.firstName || "(empty)");
  console.log("Profile lastName:", p.lastName || "(empty)");
  console.log("Profile email:", p.email || "(empty)");
  console.log("Profile phone:", p.phone || "(empty)");
  console.log("Profile city:", p.city || "(empty)");
}
main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => process.exit(0));
