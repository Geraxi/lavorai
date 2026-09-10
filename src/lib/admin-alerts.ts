import { prisma } from "@/lib/db";

/**
 * Alert operativi per la campanella dell'admin. Serializzabili (niente JSX):
 * la topbar client li riceve dal layout server. Ogni alert porta a una pagina
 * dove si può agire.
 */
export interface AdminAlert {
  id: string;
  tone: "bad" | "warn" | "info";
  title: string;
  detail: string;
  href: string;
}

export async function getAdminAlerts(): Promise<AdminAlert[]> {
  const since = (h: number) => new Date(Date.now() - h * 3600_000);
  const [creditFailures6h, failed24h, jobsTotal, jobsFresh24h, awaitingConsent, lastDone, queuedStale] = await Promise.all([
    prisma.application.count({
      where: {
        status: "failed",
        createdAt: { gte: since(6) },
        OR: [
          { errorMessage: { contains: "credit balance", mode: "insensitive" } },
          { errorMessage: { contains: "crediti esauriti", mode: "insensitive" } },
        ],
      },
    }),
    prisma.application.count({ where: { status: "failed", completedAt: { gte: since(24) } } }),
    prisma.job.count(),
    prisma.job.count({ where: { cachedAt: { gte: since(24) } } }),
    prisma.application.count({ where: { status: "awaiting_consent" } }),
    prisma.application.findFirst({ where: { completedAt: { not: null } }, orderBy: { completedAt: "desc" }, select: { completedAt: true } }),
    prisma.application.count({ where: { status: "queued", createdAt: { lt: since(1) } } }),
  ]).catch(() => [0, 0, 0, 0, 0, null, 0] as const);

  const alerts: AdminAlert[] = [];
  if (creditFailures6h > 0) alerts.push({ id: "credits", tone: "bad", title: "Crediti AI esauriti", detail: `${creditFailures6h} candidature fallite nelle ultime 6h`, href: "/admin/delivery" });
  if (queuedStale > 0) alerts.push({ id: "worker", tone: "bad", title: "Worker fermo?", detail: `${queuedStale} candidature in coda da più di 1h`, href: "/admin/delivery" });
  if (failed24h >= 10) alerts.push({ id: "failed", tone: "warn", title: "Molte candidature fallite", detail: `${failed24h} fallite nelle ultime 24h`, href: "/admin/delivery" });
  if (jobsFresh24h === 0 && jobsTotal > 0) alerts.push({ id: "jobs", tone: "warn", title: "Job pool non aggiornato", detail: "Nessun annuncio nuovo nelle ultime 24h", href: "/admin/jobs" });
  if (awaitingConsent > 5) alerts.push({ id: "consent", tone: "warn", title: "Candidature in attesa di consenso", detail: `${awaitingConsent} ferme: gli utenti non hanno cliccato Consenti`, href: "/admin/automation" });
  if (lastDone?.completedAt && Date.now() - lastDone.completedAt.getTime() > 12 * 3600_000) {
    alerts.push({ id: "idle", tone: "info", title: "Nessuna candidatura elaborata da 12h", detail: `Ultima: ${lastDone.completedAt.toLocaleString("it-IT", { timeZone: "Europe/Rome" })}`, href: "/admin/delivery" });
  }
  return alerts;
}
