import { prisma } from "../src/lib/db";

async function main() {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: "umbertogeraci0@gmail.com" },
  });
  const titles = ["UX Designer", "Senior Product Designer"];
  for (const t of titles) {
    const existing = await prisma.applicationSession.findFirst({
      where: {
        userId: u.id,
        status: { in: ["active", "auto", "paused"] },
        title: t,
      },
    });
    if (existing) {
      console.log(`Already active: ${t}`);
      continue;
    }
    const key = `round::${t.toLowerCase().replace(/\s+/g, "-")}::${Date.now()}`;
    const r = await prisma.applicationSession.create({
      data: {
        userId: u.id,
        key,
        label: `Round ${t}`,
        title: t,
        targetCount: 50,
        sentCount: 0,
        status: "active",
      },
    });
    console.log(`Created: ${r.title} (${r.id})`);
  }
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
