/**
 * Reset candidature "inviate" a email placeholder (tua.email@email.com,
 * nome.cognome@azienda.it, ecc.). Queste email NON sono arrivate a
 * nessuno di reale. Le rimettiamo a ready_to_apply.
 *
 * Pulisce anche Job.recruiterEmail per quei job così al prossimo tentativo
 * faremo rescrape (con lo scraper migliorato).
 */
import { prisma } from "../src/lib/db";

const PLACEHOLDER_DOMAINS = [
  "email.com",
  "example.com",
  "example.org",
  "example.it",
  "domain.com",
  "test.com",
  "sample.com",
  "yourdomain.com",
  "yourcompany.com",
  "azienda.it",
  "company.com",
  "mail.com",
  "adzuna.it",
  "adzuna.com",
];
const PLACEHOLDER_LOCALS = [
  "tua.email",
  "tuaemail",
  "your.email",
  "nome.cognome",
  "name.surname",
  "name",
  "nome",
  "email",
  "test",
  "example",
  "esempio",
  "user",
  "john.doe",
  "mario.rossi",
];

async function main() {
  const jobs = await prisma.job.findMany({
    where: { recruiterEmail: { not: null } },
    select: { id: true, recruiterEmail: true, title: true, company: true },
  });

  const badJobIds: string[] = [];
  for (const j of jobs) {
    const email = (j.recruiterEmail ?? "").toLowerCase();
    const [local, domain] = email.split("@");
    const isBad =
      PLACEHOLDER_DOMAINS.includes(domain ?? "") ||
      PLACEHOLDER_LOCALS.includes(local ?? "");
    if (isBad) {
      badJobIds.push(j.id);
      console.log(`  BAD: ${j.recruiterEmail}  @  "${j.title}" (${j.company})`);
    }
  }
  console.log(`\n${badJobIds.length} job con email placeholder.`);

  if (badJobIds.length === 0) return;

  // Reset: Job.recruiterEmail = null, scrapedAt = null (così il prossimo
  // worker rescrape con lo scraper nuovo)
  await prisma.job.updateMany({
    where: { id: { in: badJobIds } },
    data: { recruiterEmail: null, recruiterScrapedAt: null },
  });

  // Applications collegate a quei job, se in status=success → reset
  const apps = await prisma.application.findMany({
    where: {
      jobId: { in: badJobIds },
      status: "success",
      submittedVia: "email_recruiter",
    },
    select: { id: true },
  });
  console.log(`${apps.length} candidature "success" legate a quei job.`);
  if (apps.length > 0) {
    await prisma.application.updateMany({
      where: { id: { in: apps.map((a) => a.id) } },
      data: {
        status: "ready_to_apply",
        completedAt: null,
        submittedVia: null,
        errorMessage:
          "La candidatura era stata inviata a un'email placeholder nel job posting (non reale). Reset in attesa di nuovo tentativo con scraper migliorato.",
      },
    });
    console.log(`Reset ${apps.length} candidature a ready_to_apply.`);
  }
}

main().finally(() => prisma.$disconnect());
