import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { jobMatchesLocationPrefs } from "@/lib/auto-apply-cron";
import { effectiveTier } from "@/lib/billing";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/applications/why-zero
 *
 * Diagnostica "perché lo zero ieri/oggi?" che simula la pipeline del
 * cron auto-apply e mostra il funnel per l'utente corrente:
 *
 *   - tier effettivo (whitelist Pro+ inclusa)
 *   - prefs raw (roles, locations, salaryMin, employmentType)
 *   - applications create last 48h (per status)
 *   - inventory funnel:
 *       totalInPool      → tutti i job ATS submittabili (Greenhouse/Lever/...)
 *       afterRoleMatch   → quelli che matchano almeno un role (token-based)
 *       afterLocation    → quelli che passano il filtro location
 *       afterNotApplied  → quelli a cui l'utente non si è già candidato
 *
 * Output JSON con un campo `diagnosis` che è un'inferenza in italiano
 * di cosa probabilmente sta ammazzando il funnel.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  const tier = effectiveTier({ tier: user.tier, email: user.email });

  // Prefs
  const prefs = await prisma.userPreferences.findUnique({
    where: { userId: user.id },
    select: {
      rolesJson: true,
      locationsJson: true,
      salaryMin: true,
      employmentType: true,
      autoApplyMode: true,
      matchMin: true,
      dailyCap: true,
    },
  });
  if (!prefs) {
    return NextResponse.json({
      tier,
      diagnosis:
        "Non hai ancora salvato delle preferenze. Vai su /preferences e imposta ruoli + location + autoApplyMode = auto.",
    });
  }

  let roles: string[] = [];
  try {
    const arr = JSON.parse(prefs.rolesJson);
    if (Array.isArray(arr)) roles = arr.filter((s): s is string => typeof s === "string").map((s) => s.trim()).filter(Boolean);
  } catch {
    /* noop */
  }
  let locations: string[] = [];
  try {
    const arr = JSON.parse(prefs.locationsJson);
    if (Array.isArray(arr)) locations = arr.filter((s): s is string => typeof s === "string").map((s) => s.trim()).filter(Boolean);
  } catch {
    /* noop */
  }

  // Applications last 48h
  const since48h = new Date(Date.now() - 48 * 3600_000);
  const recentApps = await prisma.application.groupBy({
    by: ["status"],
    where: { userId: user.id, createdAt: { gte: since48h } },
    _count: { _all: true },
  });
  const last48hByStatus: Record<string, number> = {};
  for (const r of recentApps) last48hByStatus[r.status] = r._count._all;
  const last48hTotal = recentApps.reduce((s, r) => s + r._count._all, 0);

  // Inventory funnel: stessi filtri WHERE che usa il cron auto-apply
  const baseWhere = {
    source: {
      in: ["greenhouse", "lever", "ashby", "smartrecruiters", "linkedin"] as string[],
    },
    OR: [
      { url: { contains: "boards.greenhouse.io" } },
      { url: { contains: "job-boards.greenhouse.io" } },
      { url: { contains: "jobs.lever.co" } },
      { url: { contains: "workable.com/j/" } },
      { url: { contains: "apply.workable.com" } },
      { url: { contains: "jobs.ashbyhq.com" } },
      { url: { contains: "ashbyhq.com" } },
      { url: { contains: "jobs.smartrecruiters.com" } },
      { url: { contains: "careers.smartrecruiters.com" } },
    ],
  };

  const totalInPool = await prisma.job.count({ where: baseWhere });

  // Role match: AND-of-tokens (≥3 char) per ciascun ruolo
  let afterRoleMatch = 0;
  let roleMatchSampleTitles: string[] = [];
  if (roles.length > 0) {
    const orClauses = roles.slice(0, 5).map((r) => ({
      AND: r
        .split(/\s+/)
        .filter((tok) => tok.length >= 3)
        .map((tok) => ({ title: { contains: tok, mode: "insensitive" as const } })),
    }));
    const matched = await prisma.job.findMany({
      where: { ...baseWhere, AND: [{ OR: orClauses }] },
      select: { title: true, company: true, location: true, remote: true },
      take: 500,
    });
    afterRoleMatch = matched.length;
    roleMatchSampleTitles = matched.slice(0, 5).map((m) => `${m.title} @ ${m.company ?? "?"}${m.location ? ` (${m.location})` : ""}`);

    // Location filter applicato in-memory sui matched
    const passLocation = matched.filter((m) =>
      jobMatchesLocationPrefs({ location: m.location, remote: m.remote }, locations),
    );
    var afterLocation = passLocation.length;
    var locationSampleSurvivors = passLocation.slice(0, 5).map((m) => `${m.title} @ ${m.company ?? "?"}${m.location ? ` (${m.location})` : ""}`);
  } else {
    var afterLocation = 0;
    var locationSampleSurvivors: string[] = [];
  }

  // Already-applied filter
  const myAppliedJobIds = await prisma.application.findMany({
    where: { userId: user.id, status: { in: ["success", "queued", "optimizing", "applying"] } },
    select: { jobId: true },
  });
  const appliedSet = new Set(myAppliedJobIds.map((a) => a.jobId));

  // Pool freshness
  const newestJob = await prisma.job.findFirst({
    where: baseWhere,
    orderBy: { cachedAt: "desc" },
    select: { cachedAt: true, postedAt: true },
  });

  // Build diagnosis
  let diagnosis = "";
  if (prefs.autoApplyMode === "off") {
    diagnosis = "🔴 autoApplyMode è 'off'. Il cron non parte. Vai su /preferences e seleziona 'auto' (o 'hybrid' se vuoi conferma manuale).";
  } else if (roles.length === 0) {
    diagnosis = "🔴 Nessun ruolo configurato. Aggiungili in /preferences.";
  } else if (totalInPool === 0) {
    diagnosis = "🔴 Il pool di job è VUOTO. Il cron sync-jobs non sta inserendo nuovi annunci. Indagare.";
  } else if (afterRoleMatch === 0) {
    diagnosis = `🟡 Nessun job nel pool ha un titolo che matcha i tuoi ruoli (${roles.join(", ")}). Possibili cause: ruoli troppo specifici (es. "Senior Founding Engineer Web3"), o pool dominato da altri verticali. Prova a generalizzare i ruoli.`;
  } else if (locations.length > 0 && afterLocation === 0) {
    diagnosis = `🟡 ${afterRoleMatch} job matchano i ruoli MA nessuno passa il filtro location (${locations.join(", ")}). Cause tipiche: le tue location sono geografie poco coperte dai nostri scrape (es. Dubai/UAE, Milano specifico). Soluzione veloce: aggiungi "Remote" o "Italy" o "EU" alle location.`;
  } else if (last48hTotal === 0) {
    diagnosis = `🟢 ${afterLocation} job passano TUTTI i filtri ma in 48h zero candidature. Probabili cause: daily cap già consumato, o il cron sync-jobs non è girato, o stiamo applicando ma le candidature sono in stato queued/optimizing senza success. Controlla i job in /applications con filtro all.`;
  } else {
    diagnosis = `🟢 ${last48hTotal} candidature in 48h, status: ${JSON.stringify(last48hByStatus)}. Funnel funziona.`;
  }

  return NextResponse.json({
    tier,
    prefs: {
      autoApplyMode: prefs.autoApplyMode,
      matchMin: prefs.matchMin,
      dailyCap: prefs.dailyCap,
      salaryMin: prefs.salaryMin,
      employmentType: prefs.employmentType,
      roles,
      locations,
    },
    last48h: { total: last48hTotal, byStatus: last48hByStatus },
    funnel: {
      totalInPool,
      afterRoleMatch,
      afterLocation,
      alreadyAppliedFromUser: appliedSet.size,
    },
    samples: {
      roleMatchTop5: roleMatchSampleTitles,
      locationSurvivorsTop5: locationSampleSurvivors,
    },
    inventoryFreshness: {
      newestCachedAt: newestJob?.cachedAt ?? null,
      newestPostedAt: newestJob?.postedAt ?? null,
    },
    diagnosis,
  });
}
