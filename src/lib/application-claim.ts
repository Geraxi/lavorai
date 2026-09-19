import { prisma } from "@/lib/db";

/**
 * Presa in carico atomica di una candidatura in coda, indipendente da Redis.
 *
 * Chi vuole elaborare una candidatura (worker Railway via BullMQ o via polling
 * del DB, fallback self-invoke su Vercel) chiama `claimApplication`: vince chi
 * aggiorna per primo la riga (`updateMany` con condizione sullo stato). Gli
 * altri ricevono false e non fanno nulla → mai due elaborazioni in parallelo.
 *
 * Una candidatura è "prendibile" se è `queued` e non è stata presa da nessuno
 * (`startedAt` null) oppure se la presa è vecchia (processo morto a metà).
 */

export const STALE_CLAIM_MS = 20 * 60_000;

export async function claimApplication(applicationId: string): Promise<boolean> {
  const stale = new Date(Date.now() - STALE_CLAIM_MS);
  const r = await prisma.application.updateMany({
    where: { id: applicationId, status: "queued", OR: [{ startedAt: null }, { startedAt: { lt: stale } }] },
    data: { startedAt: new Date() },
  });
  return r.count === 1;
}

/**
 * Recupera candidature bloccate in `optimizing` o `applying` da troppo tempo.
 * Un worker crash, timeout AI, o Playwright hang lasciano la candidatura in
 * uno stato intermedio senza completedAt. Dopo STALE_CLAIM_MS le riportiamo
 * in `queued` così il prossimo worker le riprende.
 */
export async function recoverStuckApplications(): Promise<number> {
  const stale = new Date(Date.now() - STALE_CLAIM_MS);
  const stuck = await prisma.application.findMany({
    where: {
      status: { in: ["optimizing", "applying"] },
      startedAt: { lt: stale },
      completedAt: null,
    },
    select: { id: true, status: true },
    take: 50,
  });
  let recovered = 0;
  for (const app of stuck) {
    await prisma.application.update({
      where: { id: app.id },
      data: {
        status: "queued",
        startedAt: null,
        errorMessage: `Riavviato: bloccato in ${app.status} per più di ${STALE_CLAIM_MS / 60_000} minuti (worker crash/timeout). Nessun dato perso.`,
      },
    });
    recovered++;
  }
  return recovered;
}

/** Candidature in coda prendibili, dalla più vecchia. Richiama recovery prima. */
export async function findClaimableQueued(limit: number): Promise<string[]> {
  // Recupera candidature stuck PRIMA di prendere le queued (così se ne libera qualcuna)
  await recoverStuckApplications().catch((err) =>
    console.warn("[claim] recovery failed", err),
  );
  const stale = new Date(Date.now() - STALE_CLAIM_MS);
  const rows = await prisma.application.findMany({
    where: { status: "queued", OR: [{ startedAt: null }, { startedAt: { lt: stale } }] },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Rimette una candidatura in stato prendibile (da chiamare all'enqueue). */
export async function resetClaim(applicationId: string): Promise<void> {
  await prisma.application
    .updateMany({ where: { id: applicationId, status: "queued" }, data: { startedAt: null } })
    .catch(() => void 0);
}
