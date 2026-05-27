import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { Panel, PageTitle } from "../_ui";

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

      <Panel title="💼 Job pool per fonte">
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.7 }}>
          {jobsBySource.map((r) => `${r.source}: ${r._count._all}`).join(" · ") || "vuoto"}
          <div style={{ marginTop: 8 }}>
            Job più recente cached: {newestJob?.cachedAt ? newestJob.cachedAt.toLocaleString("it-IT") : "—"}
            {newestJob?.cachedAt && Date.now() - newestJob.cachedAt.getTime() > 6 * 3600e3 && (
              <span style={{ color: "#fbbf24" }}> ⚠️ &gt;6h fa — il cron sync-jobs potrebbe non girare</span>
            )}
          </div>
        </div>
      </Panel>

      <Panel title="📧 Email inviate (7g)">
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.7 }}>
          {emailsByKind7d.length === 0 ? "nessuna" : emailsByKind7d.map((r) => `${r.kind}: ${r._count._all}`).join(" · ")}
        </div>
      </Panel>

      <Panel title="⚙️ Auto-apply mode (utenti)">
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.7 }}>
          {autoApplyUsers.length === 0 ? "nessuna preferenza" : autoApplyUsers.map((r) => `${r.autoApplyMode}: ${r._count._all}`).join(" · ")}
        </div>
      </Panel>
    </>
  );
}
