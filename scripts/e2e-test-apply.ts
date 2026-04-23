/**
 * E2E test: crea un Application per un utente reale + job Greenhouse,
 * mette in coda via BullMQ, poi polla lo stato finché il worker non finisce.
 *
 * Uso:
 *   railway variables --kv | ... DATABASE_URL=... REDIS_URL=... npx tsx scripts/e2e-test-apply.ts <userEmail> [jobSource]
 *
 * Default: umbertogeraci0@gmail.com, greenhouse
 */
import { prisma } from "../src/lib/db";
import { getApplicationsQueue } from "../src/lib/bullmq-queue";

async function main() {
  const email = process.argv[2] ?? "umbertogeraci0@gmail.com";
  const source = process.argv[3] ?? "greenhouse";

  console.log(`\n🧪 E2E test — user=${email} source=${source}\n`);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`User ${email} non trovato`);
  console.log(`✓ user: ${user.id}`);

  const cv = await prisma.cVDocument.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  if (!cv) throw new Error(`${email} non ha nessun CVDocument`);
  console.log(`✓ cv: ${cv.id} (${cv.extractedText.length} char)`);

  const profile = await prisma.cVProfile.findUnique({
    where: { userId: user.id },
  });
  console.log(`✓ profile: ${profile ? "yes" : "MISSING (worker farà seed)"}`);

  // Pick un job Greenhouse/Lever random tra quelli più recenti
  const job = await prisma.job.findFirst({
    where: { source, remote: true },
    orderBy: { postedAt: "desc" },
  });
  if (!job) throw new Error(`Nessun job ${source} remote trovato`);
  console.log(`✓ job: "${job.title}" @ ${job.company}`);
  console.log(`  url: ${job.url}`);

  // Token univoco per tracking pixel
  const trackingToken = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const app = await prisma.application.create({
    data: {
      userId: user.id,
      jobId: job.id,
      portal: source,
      status: "queued",
      trackingToken,
      atsScore: 85,
    },
  });
  console.log(`\n✓ application created: ${app.id}`);

  const q = getApplicationsQueue();
  await q.add("process", { applicationId: app.id }, { jobId: app.id });
  console.log(`✓ enqueued su BullMQ\n`);
  console.log(`⏳ polling status ogni 10s...\n`);

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const row = await prisma.application.findUnique({ where: { id: app.id } });
    if (!row) {
      console.log(`  [${i}] row scomparsa`);
      break;
    }
    console.log(
      `  [${i}] status=${row.status} via=${row.submittedVia ?? "null"} err=${(row.errorMessage ?? "").slice(0, 80)}`,
    );
    if (
      row.status === "success" ||
      row.status === "failed" ||
      row.status === "ready_to_apply"
    ) {
      console.log(
        `\n🏁 Terminato: status=${row.status} submittedVia=${row.submittedVia}`,
      );
      if (row.errorMessage) console.log(`   errorMessage: ${row.errorMessage}`);
      break;
    }
  }
}

main()
  .catch((err) => {
    console.error("❌", err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
