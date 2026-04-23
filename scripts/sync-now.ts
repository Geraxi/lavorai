/**
 * Run una tantum del sync Greenhouse+Lever contro il DB prod.
 *   railway variables --kv | grep DATABASE_URL=... && DATABASE_URL=... npx tsx scripts/sync-now.ts
 */
import { syncAtsJobs } from "../src/lib/scrapers/sync-jobs";
import { prisma } from "../src/lib/db";

async function main() {
  const t0 = Date.now();
  const res = await syncAtsJobs();
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s:`, res);
  const gh = await prisma.job.count({ where: { source: "greenhouse" } });
  const lv = await prisma.job.count({ where: { source: "lever" } });
  const adz = await prisma.job.count({ where: { source: "adzuna" } });
  console.log(`\nTotale nel DB: greenhouse=${gh}  lever=${lv}  adzuna=${adz}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
