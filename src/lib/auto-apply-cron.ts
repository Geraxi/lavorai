import { prisma } from "@/lib/db";
import { rowToProfile } from "@/lib/cv-profile-types";
import { quickMatchScore } from "@/lib/match-score";
import { enqueueApplication } from "@/lib/application-queue";
import { resolveSession } from "@/lib/apply-session";
import { effectiveTier, getLimits } from "@/lib/billing";
import { titleMatchesAnyRole } from "@/lib/role-match";

/**
 * Auto-apply cron: per ogni utente con autoApplyMode="auto", scova job
 * compatibili e accoda candidature SENZA richiedere un'azione manuale.
 *
 * Guardrail:
 *  - solo mode=auto
 *  - rispetta UserPreferences.dailyCap (candidature già create oggi)
 *  - score >= matchMin (già nel profilo)
 *  - aziende escluse → skip
 *  - job già candidati → skip (dedup su userId+jobId)
 *  - session.status=paused → skip
 *  - tier paywall mensile (free: 3/mese)
 *  - cap globale per run: 5 candidature per utente (per non saturare la coda)
 */

const PER_USER_RUN_CAP = 5;

function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface RunStats {
  usersProcessed: number;
  applicationsEnqueued: number;
  skippedDailyCap: number;
  skippedMonthlyPaywall: number;
  skippedMatchThreshold: number;
  skippedRoleMismatch: number;
  skippedAlreadyApplied: number;
  skippedAvoidedCompany: number;
  skippedSessionPaused: number;
  errors: number;
}

export async function runAutoApplyCron(): Promise<RunStats> {
  const stats: RunStats = {
    usersProcessed: 0,
    applicationsEnqueued: 0,
    skippedDailyCap: 0,
    skippedMonthlyPaywall: 0,
    skippedMatchThreshold: 0,
    skippedRoleMismatch: 0,
    skippedAlreadyApplied: 0,
    skippedAvoidedCompany: 0,
    skippedSessionPaused: 0,
    errors: 0,
  };

  // Utenti in modalità auto con CV + preferenze
  const eligibleUsers = await prisma.user.findMany({
    where: {
      preferences: { autoApplyMode: "auto" },
      cvDocuments: { some: {} },
      cvProfile: { isNot: null },
    },
    select: {
      id: true,
      email: true,
      tier: true,
      avoidCompanies: true,
      preferences: {
        select: {
          autoApplyMode: true,
          matchMin: true,
          dailyCap: true,
          rolesJson: true,
          locationsJson: true,
          salaryMin: true,
        },
      },
      cvProfile: true,
    },
  });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  for (const user of eligibleUsers) {
    try {
      stats.usersProcessed++;
      await processUser(user, stats, todayStart, monthStart);
    } catch (err) {
      console.error(`[auto-apply-cron] user ${user.id} errored`, err);
      stats.errors++;
    }
  }

  return stats;
}

async function processUser(
  user: {
    id: string;
    email: string;
    tier: string;
    avoidCompanies: string | null;
    preferences: {
      autoApplyMode: string;
      matchMin: number;
      dailyCap: number;
      rolesJson: string;
      locationsJson: string;
      salaryMin: number;
    } | null;
    cvProfile: Parameters<typeof rowToProfile>[0] | null;
  },
  stats: RunStats,
  todayStart: Date,
  monthStart: Date,
): Promise<void> {
  if (!user.preferences || !user.cvProfile) return;
  const prefs = user.preferences;
  const profile = rowToProfile(user.cvProfile);

  // Ruoli attesi
  let roles: string[] = [];
  try {
    const arr = JSON.parse(prefs.rolesJson);
    if (Array.isArray(arr))
      roles = arr.filter((s: unknown) => typeof s === "string" && s.length > 0);
  } catch {
    /* noop */
  }
  if (roles.length === 0) return;

  // Daily cap = quante già create oggi
  const todayCount = await prisma.application.count({
    where: { userId: user.id, createdAt: { gte: todayStart } },
  });
  let remainingToday = Math.max(0, prefs.dailyCap - todayCount);
  if (remainingToday === 0) {
    stats.skippedDailyCap++;
    return;
  }

  // Paywall mensile (free = 3/mese; pro/pro+ = più alto)
  const tier = effectiveTier({ tier: user.tier, email: user.email });
  const limits = getLimits(tier);
  if (limits.monthlyApplications !== Infinity) {
    const monthCount = await prisma.application.count({
      where: { userId: user.id, createdAt: { gte: monthStart } },
    });
    const remainingMonth = Math.max(
      0,
      limits.monthlyApplications - monthCount,
    );
    if (remainingMonth === 0) {
      stats.skippedMonthlyPaywall++;
      return;
    }
    remainingToday = Math.min(remainingToday, remainingMonth);
  }

  // Cap globale per run
  remainingToday = Math.min(remainingToday, PER_USER_RUN_CAP);

  const avoidSet = new Set(
    (user.avoidCompanies ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

  // Job candidati: match su titoli per ciascun ruolo, fonti Greenhouse/Lever
  // (quelli con URL ATS diretto — submit reale funziona). Adzuna è troppo
  // fragile per auto-apply senza intervento utente.
  const jobs = await prisma.job.findMany({
    where: {
      // "linkedin" = job scovato da Apify il cui applyUrl è già stato
      // filtrato a un ATS supportato (vedi linkedin-apify.ts), quindi
      // il submit avviene sul form Greenhouse/Lever/Workable/BambooHR
      // originale — zero automazione su linkedin.com.
      source: { in: ["greenhouse", "lever", "linkedin"] },
      // URL canoniche vanilla: gli adapter Playwright funzionano solo
      // su boards.greenhouse.io e jobs.lever.co. Aziende con career
      // page custom (es. stripe.com/jobs) falliscono sempre → skip.
      OR: [
        { url: { contains: "boards.greenhouse.io" } },
        { url: { contains: "job-boards.greenhouse.io" } },
        { url: { contains: "jobs.lever.co" } },
        { url: { contains: "workable.com/j/" } },
        { url: { contains: "apply.workable.com" } },
      ],
      AND: [
        {
          OR: roles.slice(0, 5).map((r) => ({
            title: { contains: r, mode: "insensitive" },
          })),
        },
      ],
      // Skip job già candidati da questo utente
      NOT: {
        applications: { some: { userId: user.id } },
      },
    },
    orderBy: { postedAt: "desc" },
    take: 50,
  });

  if (jobs.length === 0) return;

  let enqueued = 0;
  for (const job of jobs) {
    if (enqueued >= remainingToday) break;

    // Match STRETTO sul titolo: tutti i token significativi del ruolo
    // devono essere presenti. "Product Designer" → sì "Senior Product
    // Designer", no "Product Engineer".
    if (!titleMatchesAnyRole(job.title, roles)) {
      stats.skippedRoleMismatch++;
      continue;
    }

    // Azienda esclusa?
    if (job.company && avoidSet.has(job.company.toLowerCase())) {
      stats.skippedAvoidedCompany++;
      continue;
    }

    // Match threshold. Arricchiamo il profilo con i ruoli dichiarati
    // nelle preferenze (roles): così chi cerca "Product Designer" ma sul
    // CV ha solo esperienze da studente vede comunque scattare il
    // role-title boost.
    const scoreProfile = {
      ...profile,
      experiences: [
        ...(profile.experiences ?? []),
        ...roles.map((r) => ({
          role: r,
          company: "",
          location: "",
          startDate: "",
          endDate: "",
          description: "",
          bullets: [] as string[],
        })),
      ],
    };
    const score = quickMatchScore(
      scoreProfile,
      `${job.title}\n${job.company ?? ""}\n${job.description}`,
    );
    if (prefs.matchMin > 0 && score < prefs.matchMin) {
      stats.skippedMatchThreshold++;
      if (stats.skippedMatchThreshold <= 5) {
        console.log(
          `[auto-apply-cron] SKIP match: score=${score} < matchMin=${prefs.matchMin} | "${job.title}" @ ${job.company}`,
        );
      }
      continue;
    }
    if (stats.applicationsEnqueued + 1 <= 3) {
      console.log(
        `[auto-apply-cron] PASS match: score=${score} ≥ matchMin=${prefs.matchMin} | "${job.title}" @ ${job.company}`,
      );
    }

    // Salary filter (se impostato)
    if (prefs.salaryMin > 0) {
      const salaryCap = prefs.salaryMin * 1000;
      const jobTop = job.salaryMax ?? job.salaryMin ?? 0;
      if (jobTop > 0 && jobTop < salaryCap) continue;
    }

    // Resolve session + check paused
    const session = await resolveSession(user.id, {
      title: job.title,
      category: job.category,
    });
    if (session.status === "paused") {
      stats.skippedSessionPaused++;
      continue;
    }

    const portal = portalOf(job.url);

    try {
      const app = await prisma.application.create({
        data: {
          userId: user.id,
          jobId: job.id,
          portal,
          status: "queued",
          trackingToken: randomToken(),
          atsScore: score,
          sessionId: session.id,
        },
      });
      await enqueueApplication(app.id);
      enqueued++;
      stats.applicationsEnqueued++;
    } catch (err) {
      console.error(
        `[auto-apply-cron] user ${user.id} job ${job.id} create failed`,
        err,
      );
      stats.errors++;
    }
  }
}

function portalOf(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("greenhouse")) return "greenhouse";
  if (u.includes("lever.co")) return "lever";
  if (u.includes("workable.com")) return "workable";
  if (u.includes("linkedin")) return "linkedin";
  if (u.includes("indeed")) return "indeed";
  if (u.includes("infojobs")) return "infojobs";
  return "other";
}
