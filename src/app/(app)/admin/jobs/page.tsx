import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { Panel, PageTitle } from "../_ui";
import { AdminSyncButton } from "@/components/admin-sync-button";
import { AdminRetryCreditButton } from "@/components/admin-retry-credit-button";
import { AdminAutoApplyButton } from "@/components/admin-autoapply-button";
import { AdminUpgradeNudgesButton } from "@/components/admin-upgrade-nudges-button";
import { AdminReparseCvButton } from "@/components/admin-reparse-cv-button";

export const metadata: Metadata = { title: "Admin · Job pool", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminJobsPage() {
  const since7d = new Date(Date.now() - 7 * 24 * 3600_000);
  const [jobsBySource, newestJob, emailsByKind7d, autoApplyUsers] = await Promise.all([
    prisma.job.groupBy({ by: ["source"], _count: { _all: true } }),
    prisma.job.findFirst({ orderBy: { cachedAt: "desc" }, select: { cachedAt: true, postedAt: true } }),
    prisma.emailLog.groupBy({ by: ["kind"], where: { createdAt: { gte: since7d } }, _count: { _all: true } }),
    prisma.userPreferences.groupBy({ by: ["autoApplyMode"], _count: { _all: true } }),
  ]);

  return (
    <>
      <PageTitle title="Job pool & motore" sub="Annunci scaricati, email inviate, modalità auto-apply utenti" />

      <Panel title="Sync manuale (ATS + demand-driven)">
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.6, marginBottom: 10 }}>
          Forza un fetch immediato: scraper ATS + ricerca Adzuna sui ruoli che gli utenti reali hanno selezionato (es. Meteorologo, Analista Climatico).
        </div>
        <AdminSyncButton />
      </Panel>

      <Panel title="Recupero candidature fallite">
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.6, marginBottom: 10 }}>
          Ri-accoda le candidature andate in errore per crediti AI esauriti (ora che i crediti sono di nuovo disponibili). Le rimette in coda al worker.
        </div>
        <AdminRetryCreditButton />
      </Panel>

      <Panel title="Lancia candidature automatiche">
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.6, marginBottom: 10 }}>
          Esegue subito il cron auto-apply: accoda candidature per utenti in modalità auto (inviate dal worker) e prepara quelle hybrid (da approvare su /applications).
        </div>
        <AdminAutoApplyButton />
      </Panel>

      <Panel title="Ri-parsa CV (recupero profili vuoti)">
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.6, marginBottom: 10 }}>
          Riprocessa i CV degli utenti con cvProfile vuoto (fallout del bug modello Anthropic risolto). Sblocca l&apos;auto-apply intelligente per Giuseppe, Martin, Angelica, Leonida e altri 6-8 utenti.
        </div>
        <AdminReparseCvButton />
      </Panel>

      <Panel title="Upgrade nudges (Free → Pro)">
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.6, marginBottom: 10 }}>
          Invia l&apos;email upgrade_nudge agli utenti Free eleggibili. Priorità ai limit-hit (esaurito il tetto mensile) — massima conversione. Cooldown 10gg per utente, esclusi test/interni.
        </div>
        <AdminUpgradeNudgesButton />
      </Panel>

      <Panel title="Job pool per fonte">
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.7 }}>
          {jobsBySource.map((r) => `${r.source}: ${r._count._all}`).join(" · ") || "vuoto"}
          <div style={{ marginTop: 8 }}>
            Job più recente cached: {newestJob?.cachedAt ? newestJob.cachedAt.toLocaleString("it-IT") : "—"}
            {newestJob?.cachedAt && Date.now() - newestJob.cachedAt.getTime() > 6 * 3600e3 && (
              <span style={{ color: "#fbbf24" }}> &gt;6h fa — il cron sync-jobs potrebbe non girare</span>
            )}
          </div>
        </div>
      </Panel>

      <Panel title="Email inviate (7g)">
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.7 }}>
          {emailsByKind7d.length === 0 ? "nessuna" : emailsByKind7d.map((r) => `${r.kind}: ${r._count._all}`).join(" · ")}
        </div>
      </Panel>

      <Panel title="Auto-apply mode (utenti)">
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.7 }}>
          {autoApplyUsers.length === 0 ? "nessuna preferenza" : autoApplyUsers.map((r) => `${r.autoApplyMode}: ${r._count._all}`).join(" · ")}
        </div>
      </Panel>
    </>
  );
}
