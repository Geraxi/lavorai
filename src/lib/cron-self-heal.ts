import { applicationsPaused } from "@/lib/application-pause";
import { prisma } from "@/lib/db";
import { isTestAccount } from "@/lib/admin";
import { extractFullProfile } from "@/lib/cv-profile-ai-full";
import { profileToRow } from "@/lib/cv-profile-types";
import { recoverStuckApplications } from "@/lib/application-claim";

/**
 * Cron self-heal step — girato PRIMA di runAutoApplyCron.
 * Ripara silenziosamente lo stato del sistema:
 *   1. Re-parsa i CVProfile vuoti/rotti (fallout modello 404 di ieri).
 *      Solo utenti reali con cvDocument caricato ma profile.firstName
 *      mancante. Cappato a 5 per run per non esplodere sui crediti AI.
 *   2. Recover stale preparation only through evidence-aware, exact-token CAS.
 *      In-flight or uncertain submissions are held for review, never replayed.
 *
 * Idempotente. Errori mai fatali: se un CV fallisce riparsing, passa
 * al prossimo. Se un enqueue fallisce, salta.
 */
export interface SelfHealReport {
  cvReparsed: number;
  cvFailed: number;
  cvSkipped: number;
  appsRequeued: number; // Legacy field; no blind requeue is performed.
  appsRecoveredSafely: number;
  appsFailed: number;
}

const MAX_CV_REPARSE_PER_RUN = 5;

export async function runCronSelfHeal(): Promise<SelfHealReport> {
  const report: SelfHealReport = {
    cvReparsed: 0,
    cvFailed: 0,
    cvSkipped: 0,
    appsRequeued: 0,
    appsRecoveredSafely: 0,
    appsFailed: 0,
  };

  if (applicationsPaused()) return report;

  // ---------- 1. Re-parse broken CV profiles ----------
  const brokenUsers = await prisma.user
    .findMany({
      where: {
        cvDocuments: { some: {} },
        OR: [
          { cvProfile: null },
          { cvProfile: { firstName: "" } },
          { cvProfile: { firstName: "-" } },
        ],
      },
      select: {
        id: true,
        email: true,
        cvDocuments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { extractedText: true },
        },
      },
      take: MAX_CV_REPARSE_PER_RUN * 3, // ne pesco di più poi filtro test
    })
    .catch(() => []);

  const realBroken = brokenUsers
    .filter((u) => !isTestAccount(u.email))
    .slice(0, MAX_CV_REPARSE_PER_RUN);

  for (const u of realBroken) {
    const text = u.cvDocuments[0]?.extractedText;
    if (!text || text.length < 50) {
      report.cvSkipped++;
      continue;
    }
    try {
      const profile = await extractFullProfile(text);
      if (!profile.firstName && !profile.lastName && !profile.title) {
        report.cvSkipped++;
        continue;
      }
      const row = profileToRow(profile);
      await prisma.cVProfile.upsert({
        where: { userId: u.id },
        create: { userId: u.id, ...row },
        update: row,
      });
      report.cvReparsed++;
      console.log(
        `[self-heal] re-parsed CV for ${u.email} → ${profile.firstName} ${profile.lastName}`,
      );
    } catch (err) {
      report.cvFailed++;
      console.error(`[self-heal] CV re-parse failed for ${u.email}:`, err);
    }
  }

  // ---------- 2. Shared evidence-aware recovery ----------
  try {
    report.appsRecoveredSafely = await recoverStuckApplications();
  } catch {
    report.appsFailed++;
    console.error("[self-heal] safe application recovery failed");
  }

  if (
    report.cvReparsed +
      report.cvFailed +
      report.appsRecoveredSafely +
      report.appsFailed >
    0
  ) {
    console.log("[self-heal] report", report);
  }

  return report;
}
