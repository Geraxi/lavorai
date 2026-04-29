import { prisma } from "../src/lib/db";

async function main() {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: "umbertogeraci0@gmail.com" },
  });

  // Cancella tutti i round attivi/paused
  const cancelled = await prisma.applicationSession.updateMany({
    where: {
      userId: u.id,
      status: { in: ["active", "auto", "paused"] },
    },
    data: { status: "cancelled", completedAt: new Date() },
  });
  console.log(`cancelled: ${cancelled.count}`);

  // Crea 1 round nuovo: Product Designer · target 100
  const key = `round::product-designer::${Date.now()}`;
  const created = await prisma.applicationSession.create({
    data: {
      userId: u.id,
      key,
      label: "Round Product Designer",
      title: "Product Designer",
      targetCount: 100,
      sentCount: 0,
      status: "active",
    },
  });
  console.log(
    `created: ${created.id} · ${created.title} · ${created.targetCount}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
