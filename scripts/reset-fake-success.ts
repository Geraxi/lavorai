/**
 * Reset delle candidature finite in "success" fake (prima del fix 69f61ef).
 * Criterio: status=success MA submittedVia IS NULL → sono proprio quelle del
 * vecchio path mock/demo in attemptAutoSubmit (prima del fix, nessuna route
 * scriveva submittedVia).
 *
 * Uso:  npx tsx scripts/reset-fake-success.ts
 */
import { prisma } from "../src/lib/db";

async function main() {
  const fake = await prisma.application.findMany({
    where: {
      status: "success",
      submittedVia: null,
    },
    include: {
      job: { select: { title: true, company: true } },
      user: { select: { email: true } },
    },
  });

  console.log(`Trovate ${fake.length} candidature fake-success da resettare.`);
  for (const a of fake) {
    console.log(
      `  - ${a.id}  user=${a.user.email}  job="${a.job.title}" @ ${a.job.company ?? "—"}`,
    );
  }

  if (fake.length === 0) {
    console.log("Nulla da fare.");
    return;
  }

  const ids = fake.map((a) => a.id);
  const result = await prisma.application.updateMany({
    where: { id: { in: ids } },
    data: {
      status: "ready_to_apply",
      completedAt: null,
      errorMessage:
        "Candidatura marcata erroneamente come inviata dal vecchio flusso. Reset in attesa di invio reale. Apri l'annuncio per candidarti manualmente se urgente.",
    },
  });
  console.log(`Reset ${result.count} candidature a ready_to_apply.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
