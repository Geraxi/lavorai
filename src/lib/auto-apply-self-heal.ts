import { prisma } from "@/lib/db";
import { enqueueApplication } from "@/lib/application-queue";
import { Resend } from "resend";

/**
 * Self-healing automatico per l'auto-apply cron.
 *
 * Gira a OGNI tick del cron auto-apply (ogni 30min via GitHub Actions).
 * Rileva e ripara automaticamente le 4 modalità di failure note che ci
 * hanno fatto perdere giorni di candidature in passato:
 *
 *   1. Sessioni "garbage" con titolo concatenato `category · role`
 *      → archiviate (inquinano roleTerms in quickMatchScore)
 *   2. Application bloccate `queued`/`optimizing`/`applying` da > 30 min
 *      → re-enqueuate (worker probabilmente crashato durante deploy)
 *   3. Utente con 0 candidature in 48h MA con sessioni attive e job
 *      pool > 50 → matchMin auto-abbassato a 25 (overshoot in prefs)
 *   4. Application failed in massa per "credit balance is too low"
 *      → admin alert email (richiede ricarica manuale Anthropic)
 *
 * Ritorna un report strutturato così la cron può loggarlo e (se
 * configurato ADMIN_ALERT_EMAIL) inviare un riepilogo.
 */

export interface SelfHealReport {
  garbageSessionsArchived: number;
  stuckAppsRequeued: number;
  matchMinAutoLowered: Array<{ userId: string; from: number; to: number }>;
  creditExhaustedUsers: string[];
  adminAlertSent: boolean;
}

const STUCK_THRESHOLD_MS = 30 * 60 * 1000; // 30 min
const ZERO_THROUGHPUT_HOURS = 48;
const MIN_JOB_POOL_FOR_AUTO_TUNE = 50;
const MATCH_MIN_AUTO_FLOOR = 25;

export async function runSelfHeal(): Promise<SelfHealReport> {
  const report: SelfHealReport = {
    garbageSessionsArchived: 0,
    stuckAppsRequeued: 0,
    matchMinAutoLowered: [],
    creditExhaustedUsers: [],
    adminAlertSent: false,
  };

  // ── 1. Archive garbage sessions ────────────────────────────────────
  try {
    const r = await prisma.applicationSession.updateMany({
      where: {
        status: { in: ["active", "auto"] },
        title: { contains: "·" },
      },
      data: { status: "archived" },
    });
    report.garbageSessionsArchived = r.count;
    if (r.count > 0)
      console.log(`[self-heal] archived ${r.count} garbage sessions`);
  } catch (err) {
    console.error("[self-heal] garbage session cleanup failed", err);
  }

  // ── 2. Re-enqueue stuck applications ───────────────────────────────
  try {
    const stuckCutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);
    const stuck = await prisma.application.findMany({
      where: {
        status: { in: ["queued", "optimizing", "applying", "submitting"] },
        OR: [
          { startedAt: { lt: stuckCutoff } },
          { startedAt: null, createdAt: { lt: stuckCutoff } },
        ],
      },
      select: { id: true },
      take: 100,
    });
    for (const app of stuck) {
      try {
        await prisma.application.update({
          where: { id: app.id },
          data: { status: "queued", startedAt: null, errorMessage: null },
        });
        await enqueueApplication(app.id);
        report.stuckAppsRequeued++;
      } catch (err) {
        console.error(`[self-heal] requeue ${app.id} failed`, err);
      }
    }
    if (report.stuckAppsRequeued > 0)
      console.log(`[self-heal] requeued ${report.stuckAppsRequeued} stuck apps`);
  } catch (err) {
    console.error("[self-heal] stuck app sweep failed", err);
  }

  // ── 3. Auto-tune matchMin for zero-throughput users ────────────────
  try {
    const cutoff = new Date(Date.now() - ZERO_THROUGHPUT_HOURS * 3600 * 1000);
    const users = await prisma.user.findMany({
      where: {
        preferences: { autoApplyMode: "auto", matchMin: { gt: MATCH_MIN_AUTO_FLOOR } },
        applicationSessions: {
          some: {
            status: { in: ["active", "auto"] },
            sentCount: { lt: 1000 }, // not full
          },
        },
      },
      select: {
        id: true,
        email: true,
        preferences: { select: { matchMin: true } },
        _count: {
          select: {
            applications: { where: { createdAt: { gte: cutoff } } },
          },
        },
      },
    });

    for (const u of users) {
      if (u._count.applications > 0) continue; // ha candidature recenti
      // Verifica che ci sia pool job sufficiente (>50 in 24h)
      const recentPool = await prisma.job.count({
        where: { cachedAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
      });
      if (recentPool < MIN_JOB_POOL_FOR_AUTO_TUNE) continue;

      const from = u.preferences?.matchMin ?? 50;
      await prisma.userPreferences.update({
        where: { userId: u.id },
        data: { matchMin: MATCH_MIN_AUTO_FLOOR },
      });
      report.matchMinAutoLowered.push({
        userId: u.id,
        from,
        to: MATCH_MIN_AUTO_FLOOR,
      });
      console.log(
        `[self-heal] user ${u.email}: matchMin ${from} → ${MATCH_MIN_AUTO_FLOOR} (0 apps in ${ZERO_THROUGHPUT_HOURS}h)`,
      );
    }
  } catch (err) {
    console.error("[self-heal] matchMin auto-tune failed", err);
  }

  // ── 4. Detect credit exhaustion → admin alert ──────────────────────
  try {
    const since = new Date(Date.now() - 4 * 3600 * 1000);
    const creditFailures = await prisma.application.findMany({
      where: {
        status: "failed",
        createdAt: { gte: since },
        errorMessage: { contains: "credit balance" },
      },
      select: { userId: true },
      distinct: ["userId"],
    });
    if (creditFailures.length > 0) {
      report.creditExhaustedUsers = creditFailures.map((c) => c.userId);
    }
  } catch (err) {
    console.error("[self-heal] credit detection failed", err);
  }

  // ── 5. Admin alert email (only if anything notable happened) ───────
  const shouldAlert =
    report.creditExhaustedUsers.length > 0 ||
    report.matchMinAutoLowered.length > 0 ||
    report.stuckAppsRequeued > 5;
  if (shouldAlert) {
    try {
      await sendAdminAlert(report);
      report.adminAlertSent = true;
    } catch (err) {
      console.error("[self-heal] admin alert failed", err);
    }
  }

  return report;
}

async function sendAdminAlert(r: SelfHealReport): Promise<void> {
  const adminEmail = process.env.ADMIN_ALERT_EMAIL ?? "umbertogeraci0@gmail.com";
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const resend = new Resend(apiKey);

  const lines: string[] = [];
  if (r.creditExhaustedUsers.length > 0) {
    lines.push(
      `🔴 CREDIT EXHAUSTED — Anthropic credit out for ${r.creditExhaustedUsers.length} user(s). Recharge https://console.anthropic.com/settings/billing`,
    );
  }
  if (r.stuckAppsRequeued > 5) {
    lines.push(`⚠️ Re-enqueued ${r.stuckAppsRequeued} stuck applications.`);
  }
  if (r.matchMinAutoLowered.length > 0) {
    lines.push(
      `🟡 Auto-lowered matchMin for ${r.matchMinAutoLowered.length} user(s) with 0 throughput in 48h.`,
    );
    for (const m of r.matchMinAutoLowered) {
      lines.push(`   - ${m.userId}: ${m.from} → ${m.to}`);
    }
  }
  if (r.garbageSessionsArchived > 0) {
    lines.push(`ℹ️ Archived ${r.garbageSessionsArchived} garbage sessions.`);
  }

  await resend.emails.send({
    from: process.env.RESEND_FROM_OVERRIDE ?? "LavorAI <noreply@lavorai.it>",
    to: adminEmail,
    subject: `[LavorAI self-heal] ${r.creditExhaustedUsers.length > 0 ? "🔴 ACTION REQUIRED" : "auto-recovered"}`,
    text: lines.join("\n\n"),
  });
}
