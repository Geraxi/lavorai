/**
 * Rimuove dalla DB i job che non sono Italia/EU/Remoto (post-filtro scraper).
 * Da eseguire dopo aver aggiornato gli scraper con il geo filter.
 */
import { prisma } from "../src/lib/db";

function isEu(loc: string, desc: string): boolean {
  const s = `${loc ?? ""} ${(desc ?? "").slice(0, 400)}`.toLowerCase();
  const no = [
    "united states only", "us only", "usa only", "canada only",
    "apac only", "brazil", "mexico", "singapore only", "japan only", "india only",
    "anywhere in the us", "us-based",
  ];
  const yes = [
    "italy", "italia", "italian", "milan", "milano", "rome", "roma", "napoli",
    "torino", "turin", "firenze", "bologna",
    "europe", "europa", "eu ", "emea",
    "germany", "germania", "france", "francia", "spain", "spagna", "netherlands",
    "portugal", "portogallo", "ireland", "irlanda", "belgium", "austria", "switzerland",
    "svizzera", "denmark", "sweden", "finland", "poland", "czech",
    "uk", "united kingdom", "london", "londra",
  ];
  if (/\bremote\b/.test(s) && !no.some((n) => s.includes(n))) return true;
  if (yes.some((y) => s.includes(y))) return true;
  return false;
}

async function main() {
  // Solo Greenhouse/Lever (Adzuna è già Italia per endpoint IT)
  const rows = await prisma.job.findMany({
    where: { source: { in: ["greenhouse", "lever"] } },
    select: { id: true, location: true, description: true, title: true, company: true },
  });
  const bad = rows.filter((j) => !isEu(j.location ?? "", j.description));
  console.log(`Total GH/Lever: ${rows.length}, to delete: ${bad.length}`);
  if (bad.length === 0) return;

  // Non eliminare job con applications collegate — mantieni history
  const withApps = await prisma.application.findMany({
    where: { jobId: { in: bad.map((b) => b.id) } },
    select: { jobId: true },
  });
  const keep = new Set(withApps.map((a) => a.jobId));
  const toDelete = bad.filter((b) => !keep.has(b.id)).map((b) => b.id);
  console.log(`Keeping ${keep.size} con applications, deleting ${toDelete.length}`);

  // Batch delete
  const batchSize = 100;
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += batchSize) {
    const ids = toDelete.slice(i, i + batchSize);
    const r = await prisma.job.deleteMany({ where: { id: { in: ids } } });
    deleted += r.count;
  }
  console.log(`Deleted ${deleted}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
