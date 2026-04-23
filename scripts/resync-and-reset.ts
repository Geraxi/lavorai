/**
 * (a) Re-sync Greenhouse + Lever così tutti i job hanno canonical URL +
 *     sourceSlug salvato.
 * (b) Reset applications in stato needs_session che sono legate a job
 *     Greenhouse/Lever — così al prossimo apply il worker usa l'adapter
 *     (URL ora canonico).
 */
import { prisma } from "../src/lib/db";
import { syncAtsJobs } from "../src/lib/scrapers/sync-jobs";

async function main() {
  console.log("Re-sync Greenhouse + Lever...");
  const r = await syncAtsJobs();
  console.log("sync done:", r);

  // Reset apps in needs_session per job Greenhouse/Lever
  const apps = await prisma.application.findMany({
    where: {
      status: "needs_session",
      job: { source: { in: ["greenhouse", "lever"] } },
    },
    select: { id: true },
  });
  console.log(`Apps needs_session su GH/Lever: ${apps.length}`);
  if (apps.length > 0) {
    await prisma.application.updateMany({
      where: { id: { in: apps.map((a) => a.id) } },
      data: {
        status: "ready_to_apply",
        errorMessage:
          "Reset — al prossimo tentativo useremo l'adapter ATS diretto.",
        completedAt: null,
      },
    });
    console.log("Reset completato.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
