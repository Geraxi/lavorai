/**
 * Riaccoda tutte le Application status=failed il cui errorMessage contiene
 * "credit balance is too low" (errore Anthropic 400 da credito esaurito).
 *
 * Uso:
 *   railway run -- npx tsx scripts/requeue-credit-failed.ts          # dry run
 *   railway run -- npx tsx scripts/requeue-credit-failed.ts --apply  # esegui
 */
import { prisma } from "../src/lib/db";
import { enqueueApplication } from "../src/lib/application-queue";

const APPLY = process.argv.includes("--apply");

async function main() {
  const failed = await prisma.application.findMany({
    where: {
      status: "failed",
      errorMessage: { contains: "credit balance is too low" },
    },
    select: {
      id: true,
      createdAt: true,
      job: { select: { title: true, company: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Trovate ${failed.length} application failed per credito Anthropic esaurito.`);
  for (const a of failed.slice(0, 10)) {
    console.log(`  - ${a.id}  ${a.job?.title} @ ${a.job?.company}  (${a.createdAt.toISOString()})`);
  }
  if (failed.length > 10) console.log(`  ... e altre ${failed.length - 10}`);

  if (!APPLY) {
    console.log("\nDry run. Rilancia con --apply per eseguire.");
    return;
  }

  // Reset stato → "queued" + clear errore, poi enqueue su BullMQ.
  let ok = 0, errors = 0;
  for (const a of failed) {
    try {
      await prisma.application.update({
        where: { id: a.id },
        data: { status: "queued", errorMessage: null },
      });
      await enqueueApplication(a.id);
      ok++;
      if (ok % 10 === 0) console.log(`  requeued ${ok}/${failed.length}`);
    } catch (err) {
      errors++;
      console.error(`  ERR ${a.id}:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`\nDone. requeued=${ok} errors=${errors}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
