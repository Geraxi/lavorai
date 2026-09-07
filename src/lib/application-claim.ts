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

/** Candidature in coda prendibili, dalla più vecchia. */
export async function findClaimableQueued(limit: number): Promise<string[]> {
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
