import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { enqueueApplication } from "@/lib/application-queue";
import { getLimits, effectiveTier } from "@/lib/billing";
import { quickMatchScore } from "@/lib/match-score";
import { rowToProfile } from "@/lib/cv-profile-types";
import { resolveSession } from "@/lib/apply-session";
import { applyLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const bodySchema = z.object({
  jobIds: z.array(z.string().min(1)).min(1).max(100),
});

function portalOf(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("linkedin")) return "linkedin";
  if (u.includes("indeed")) return "indeed";
  if (u.includes("greenhouse")) return "greenhouse";
  if (u.includes("lever.co")) return "lever";
  if (u.includes("workable.com")) return "workable";
  if (u.includes("infojobs")) return "infojobs";
  return "other";
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "unauthenticated", message: "Devi loggarti." },
        { status: 401 },
      );
    }

    // Rate limit globale (conta una sola chiamata, il limite reale è monthly)
    const rl = await applyLimiter.limit(`user:${user.id}:batch`);
    if (!rl.success) {
      return NextResponse.json(
        {
          error: "rate_limit",
          message: "Troppe candidature. Riprova tra qualche minuto.",
          reset: rl.reset,
        },
        { status: 429 },
      );
    }

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { jobIds } = parsed.data;

    // --- CV check ---
    const cv = await prisma.cVDocument.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    if (!cv) {
      return NextResponse.json(
        { error: "missing_cv", message: "Carica prima il tuo CV." },
        { status: 409 },
      );
    }

    // --- Paywall per-tier ---
    const tier = effectiveTier(user);
    const limits = getLimits(tier);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const usedThisMonth = await prisma.application.count({
      where: { userId: user.id, createdAt: { gte: monthStart } },
    });
    const remainingQuota =
      limits.monthlyApplications === Infinity
        ? Infinity
        : Math.max(0, limits.monthlyApplications - usedThisMonth);

    if (remainingQuota === 0) {
      return NextResponse.json(
        {
          error: "paywall",
          message:
            tier === "free"
              ? "Hai esaurito le 3 candidature del piano Free di questo mese."
              : `Hai esaurito il limite mensile del piano ${tier}.`,
          tier,
        },
        { status: 402 },
      );
    }

    // Fetch jobs and dedupe against already-applied + aziende escluse
    const [jobs, already, full] = await Promise.all([
      prisma.job.findMany({ where: { id: { in: jobIds } } }),
      prisma.application.findMany({
        where: { userId: user.id, jobId: { in: jobIds } },
        select: { jobId: true },
      }),
      prisma.user.findUnique({
        where: { id: user.id },
        select: { avoidCompanies: true },
      }),
    ]);
    const alreadySet = new Set(already.map((a) => a.jobId));
    const avoidSet = new Set(
      (full?.avoidCompanies ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
    const toApply = jobs.filter(
      (j) =>
        !alreadySet.has(j.id) &&
        !(j.company && avoidSet.has(j.company.toLowerCase())),
    );
    const excludedByCompany =
      jobs.length - alreadySet.size - toApply.length;

    const capped =
      remainingQuota === Infinity ? toApply : toApply.slice(0, remainingQuota);

    // --- Auto-apply mode + match threshold + CV profile ---
    const [prefs, profileRow] = await Promise.all([
      prisma.userPreferences.findUnique({
        where: { userId: user.id },
        select: { autoApplyMode: true, matchMin: true },
      }),
      prisma.cVProfile.findUnique({ where: { userId: user.id } }),
    ]);
    type Mode = "off" | "manual" | "hybrid" | "auto";
    const mode: Mode = (prefs?.autoApplyMode as Mode) ?? "manual";
    const matchMin = prefs?.matchMin ?? 0;
    const profile = profileRow ? rowToProfile(profileRow) : null;
    if (mode === "off") {
      return NextResponse.json(
        {
          error: "auto_apply_off",
          message:
            "L'auto-apply è disattivato. Vai in Preferenze per riattivarlo.",
        },
        { status: 409 },
      );
    }

    let enqueued = 0;             // inviate direttamente
    let awaitingConsent = 0;      // messe in coda "attesa consenso"
    let belowThreshold = 0;       // auto: saltate perché sotto soglia
    const errors: Array<{ jobId: string; error: string }> = [];

    for (const job of capped) {
      try {
        let score = 100;
        if (profile) {
          score = quickMatchScore(
            profile,
            `${job.title}\n${job.company ?? ""}\n${job.description}`,
          );
        }

        // Routing per modalità — la sessione può forzare awaiting_consent
        const session = await resolveSession(user.id, {
          title: job.title,
          category: job.category,
        });
        let initialStatus: "queued" | "awaiting_consent";
        if (session.status === "paused") {
          initialStatus = "awaiting_consent";
        } else if (mode === "auto") {
          if (matchMin > 0 && score < matchMin) {
            belowThreshold++;
            continue;
          }
          initialStatus = "queued";
        } else if (mode === "manual") {
          initialStatus = "awaiting_consent";
        } else {
          // hybrid: se ≥ soglia → queued, altrimenti awaiting_consent
          initialStatus =
            matchMin > 0 && score < matchMin ? "awaiting_consent" : "queued";
        }

        const portal = portalOf(job.url);
        const application = await prisma.application.create({
          data: {
            userId: user.id,
            jobId: job.id,
            portal,
            status: initialStatus,
            trackingToken: randomToken(),
            atsScore: score,
            sessionId: session.id,
          },
        });
        if (initialStatus === "queued") {
          await enqueueApplication(application.id);
          enqueued++;
        } else {
          awaitingConsent++;
        }
      } catch (err) {
        errors.push({
          jobId: job.id,
          error: err instanceof Error ? err.message : "unknown",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      enqueued,
      awaitingConsent,
      skipped: jobs.length - capped.length,
      alreadyApplied: alreadySet.size,
      excludedByCompany,
      belowThreshold,
      matchMin,
      mode,
      errors,
      remaining:
        remainingQuota === Infinity
          ? null
          : Math.max(0, remainingQuota - enqueued - awaitingConsent),
    });
  } catch (err) {
    console.error("[api/applications/apply-batch]", err);
    return NextResponse.json(
      { error: "internal", message: err instanceof Error ? err.message : "Errore" },
      { status: 500 },
    );
  }
}
