import { prisma } from "../src/lib/db";

// Account "interni"/test da escludere dal conteggio "utenti veri".
const TEST_EMAILS = new Set([
  "umbertogeraci0@gmail.com",
]);
const isTestEmail = (e: string) =>
  TEST_EMAILS.has(e.toLowerCase()) ||
  /@(example\.com|test\.)/.test(e.toLowerCase()) ||
  e.toLowerCase().includes("+test");

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      createdAt: true,
      emailVerified: true,
      applications: {
        select: { status: true, submittedVia: true, createdAt: true },
      },
    },
  });

  const real = users.filter(u => !isTestEmail(u.email));
  const test = users.filter(u => isTestEmail(u.email));

  let realDelivered = 0;
  let realReady = 0;
  let realQueuedOther = 0;
  const usersWithRealSend: { email: string; n: number }[] = [];

  for (const u of real) {
    let n = 0;
    for (const a of u.applications) {
      if (a.status === "success" && a.submittedVia) {
        realDelivered++;
        n++;
      } else if (a.status === "ready_to_apply") realReady++;
      else realQueuedOther++;
    }
    if (n > 0) usersWithRealSend.push({ email: u.email, n });
  }

  console.log(`Utenti totali: ${users.length}  (veri: ${real.length}, test: ${test.length})`);
  console.log("");
  console.log(`=== UTENTI VERI ===`);
  console.log(`Candidature INVIATE DAVVERO (success + submittedVia): ${realDelivered}`);
  console.log(`CV pronto ma NON consegnato (ready_to_apply):         ${realReady}`);
  console.log(`Altri stati (queued/failed/needs_answers/...):        ${realQueuedOther}`);
  console.log("");
  console.log(`Utenti veri con almeno 1 candidatura inviata: ${usersWithRealSend.length}`);
  for (const u of usersWithRealSend.sort((a, b) => b.n - a.n)) {
    console.log(`  ${u.n.toString().padStart(3)} × ${u.email}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
