import { applicationsPaused } from "@/lib/application-pause";
import { autoApplyPreferenceMismatch, parsePreferenceList, isAvoidedCompany } from "@/lib/auto-apply-preferences";
import { prisma } from "@/lib/db";
import { monthlyQuotaSince } from "@/lib/admin-user-actions";
import { rowToProfile } from "@/lib/cv-profile-types";
import { quickMatchScore } from "@/lib/match-score";
import { enqueueApplication } from "@/lib/application-queue";
import { resolveSession } from "@/lib/apply-session";
import { dailyApplicationLimit, effectiveTier, getLimits, isApplicationAccessPaused, requiresPaymentMethodBeforeApp } from "@/lib/billing";
import { titleMatchesAnyRole } from "@/lib/role-match";
import { runSelfHeal } from "@/lib/auto-apply-self-heal";
import { recordConversionEvent } from "@/lib/conversion-events";
import { AnalyticsEvent } from "@/lib/analytics";

/**
 * Auto-apply cron: per ogni utente con autoApplyMode="auto", scova job
 * compatibili e accoda candidature SENZA richiedere un'azione manuale.
 *
 * Guardrail:
 *  - solo mode=auto
 *  - rispetta il cap giornaliero effettivo (Free in prova: max 5/giorno)
 *  - score >= matchMin (già nel profilo)
 *  - aziende escluse → skip
 *  - job già candidati → skip (dedup su userId+jobId)
 *  - session.status=paused → skip
 *  - alla fine della prova Free il motore si ferma (account view-only)
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

export { expandLocationPref, jobMatchesLocationPrefs, autoApplyPreferenceMismatch } from "@/lib/auto-apply-preferences";

interface RunStats {
  usersProcessed: number;
  applicationsEnqueued: number;
  applicationsAwaitingConsent: number;
  skippedDailyCap: number;
  skippedMonthlyPaywall: number;
  skippedMatchThreshold: number;
  skippedRoleMismatch: number;
  skippedAlreadyApplied: number;
  skippedAvoidedCompany: number;
  skippedSessionPaused: number;
  skippedEmploymentMismatch: number;
  skippedLocationMismatch: number;
  errors: number;
}

function emptyRunStats(): RunStats {
  return {
    usersProcessed: 0,
    applicationsEnqueued: 0,
    applicationsAwaitingConsent: 0,
    skippedDailyCap: 0,
    skippedMonthlyPaywall: 0,
    skippedMatchThreshold: 0,
    skippedRoleMismatch: 0,
    skippedAlreadyApplied: 0,
    skippedAvoidedCompany: 0,
    skippedSessionPaused: 0,
    skippedEmploymentMismatch: 0,
    skippedLocationMismatch: 0,
    errors: 0,
  };
}

export async function runAutoApplyCron(): Promise<RunStats> {
  if (applicationsPaused()) return emptyRunStats();
  // Self-heal PRIMA di processare gli utenti: archivia sessioni garbage,
  // re-enqueue safe stuck apps, preserve user matchMin, alert
  // admin su credit exhaustion. Idempotente, gira ogni tick (~30min).
  try {
    const heal = await runSelfHeal();
    if (
      heal.garbageSessionsArchived +
        heal.stuckAppsRequeued +
        heal.matchMinAutoLowered.length +
        heal.creditExhaustedUsers.length >
      0
    ) {
      console.log("[auto-apply-cron] self-heal report", heal);
    }
  } catch (err) {
    console.error("[auto-apply-cron] self-heal crashed (non-fatal)", err);
  }

  const stats = emptyRunStats();

  // Utenti in modalità auto O hybrid con CV + preferenze.
  // - "auto":   creiamo candidature "queued" e le mandiamo subito in coda.
  // - "hybrid": creiamo candidature "awaiting_consent" — il motore trova e
  //             prepara i job, l'utente li approva dal dashboard. Senza
  //             questo, hybrid era di fatto morto (zero candidature mai).
  const eligibleUsers = await prisma.user.findMany({
    where: {
      suspendedAt: null,
      emailVerified: { not: null },
      onboardedAt: { not: null },
      seniority: { not: null },
      englishLevel: { not: null },
      noticePeriod: { not: null },
      preferences: {
        is: {
          autoApplyMode: { in: ["auto", "hybrid"] },
          rolesJson: { not: "[]" },
          locationsJson: { not: "[]" },
          sourcesJson: { not: "[]" },
        },
      },
      cvDocuments: { some: {} },
      cvProfile: { isNot: null },
    },
    select: {
      id: true,
      email: true,
      tier: true,
      trialEndsAt: true, trialGraceEndsAt: true,
      createdAt: true,
      avoidCompanies: true,
      quotaResetAt: true,
      preferences: {
        select: {
          autoApplyMode: true,
          matchMin: true,
          dailyCap: true,
          rolesJson: true,
          locationsJson: true,
          salaryMin: true,
          employmentType: true,
          protectedCategory: true,
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

  // Daily summary: al termine, invia un'email onesta a ogni utente con
  // attività nelle 24h ("N inviate + N preparate"). Idempotente lato
  // destinatario (cooldown 24h nella funzione). Fire-and-forget: se
  // fallisce non blocca il return dei RunStats.
  try {
    const { runDailySummary } = await import("@/lib/daily-summary");
    const dailyRes = await runDailySummary({});
    console.log(
      `[auto-apply-cron] daily-summary: sent=${dailyRes.sent} skipped=${dailyRes.skipped} errors=${dailyRes.errors}`,
    );
  } catch (err) {
    console.error("[auto-apply-cron] daily-summary failed (non-fatal)", err);
  }

  return stats;
}

/**
 * Trigger auto-apply per un singolo utente ora — usato dall'onboarding
 * per dare esperienza tangibile ("prime 3 candidature in 2 min") invece
 * di far aspettare il cron notturno. Idempotente: rispetta gli stessi
 * cap giornalieri/mensili + già-candidato del cron principale.
 *
 * Ritorna gli stats parziali solo per questo utente (utile per la UI
 * che mostra "N candidature accodate").
 */
export async function runAutoApplyForUser(userId: string): Promise<RunStats> {
  if (applicationsPaused()) return emptyRunStats();
  const stats = emptyRunStats();
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
      suspendedAt: null,
      emailVerified: { not: null },
      onboardedAt: { not: null },
      seniority: { not: null },
      englishLevel: { not: null },
      noticePeriod: { not: null },
      preferences: {
        is: {
          autoApplyMode: { in: ["auto", "hybrid"] },
          rolesJson: { not: "[]" },
          locationsJson: { not: "[]" },
          sourcesJson: { not: "[]" },
        },
      },
      cvDocuments: { some: {} },
      cvProfile: { isNot: null },
    },
    select: {
      id: true,
      email: true,
      tier: true,
      trialEndsAt: true, trialGraceEndsAt: true,
      createdAt: true,
      avoidCompanies: true,
      quotaResetAt: true,
      preferences: {
        select: {
          autoApplyMode: true,
          matchMin: true,
          dailyCap: true,
          rolesJson: true,
          locationsJson: true,
          salaryMin: true,
          employmentType: true,
          protectedCategory: true,
        },
      },
      cvProfile: true,
    },
  });
  if (!user || !user.preferences || !user.cvProfile) return stats;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  try {
    stats.usersProcessed = 1;
    await processUser(user, stats, todayStart, monthStart);
  } catch (err) {
    console.error(`[runAutoApplyForUser] ${userId} errored`, err);
    stats.errors++;
  }
  return stats;
}

async function processUser(
  user: {
    id: string;
    email: string;
    tier: string;
    trialEndsAt: Date | null;
    trialGraceEndsAt: Date | null;
    createdAt: Date;
    avoidCompanies: string | null;
    preferences: {
      autoApplyMode: string;
      matchMin: number;
      dailyCap: number;
      rolesJson: string;
      locationsJson: string;
      salaryMin: number;
      employmentType: string;
      protectedCategory?: boolean;
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
  if (!profile.title && !profile.summary && !profile.skills.length && !profile.experiences.length) return;

  // Modalità: "auto" candida direttamente (queued + enqueue), "hybrid"
  // prepara la candidatura e la lascia in "awaiting_consent" perché
  // l'utente la approvi dal dashboard. initialStatus guida entrambi i
  // create-block sotto.
  const isHybrid = prefs.autoApplyMode === "hybrid";
  const initialStatus = isHybrid ? "awaiting_consent" : "queued";

  // Round attivi (sessioni status=active|auto, non completate). I "round"
  // sono la nuova source-of-truth: ognuno ha un title + targetCount.
  // Fallback legacy: se l'utente non ha sessioni attive, leggiamo
  // preferences.rolesJson come prima (back-compat per account
  // pre-refactor). I nuovi utenti useranno solo le sessioni.
  const activeSessions = await prisma.applicationSession.findMany({
    where: {
      userId: user.id,
      status: { in: ["active", "auto"] },
    },
    select: {
      id: true,
      title: true,
      label: true,
      targetCount: true,
      sentCount: true,
      customContext: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // UNION delle source: i ruoli da cercare sono l'unione di
  // (a) titles delle sessioni attive non piene, e
  // (b) preferences.rolesJson scelti dall'utente in onboarding/preferenze.
  // Le sessioni servono per il tracking (sentCount/targetCount/customContext).
  // I ruoli senza sessione associata vengono comunque applicati e useranno
  // il fallback `resolveSession()` per assegnare una sessione virtuale.
  const rolesSet = new Map<string, string>(); // lowercase -> display
  const sessionByRole = new Map<string, (typeof activeSessions)[number]>();

  for (const s of activeSessions) {
    if (s.sentCount >= s.targetCount) continue; // round già pieno
    const t = (s.title ?? s.label).trim();
    if (!t) continue;
    // Skip session "garbage" con titolo concatenato `category · role`
    // generato da una vecchia versione: inquina roleTerms e abbassa
    // quickMatchScore. I round puliti hanno solo il role title.
    if (t.includes("·")) continue;
    const key = t.toLowerCase();
    if (!rolesSet.has(key)) rolesSet.set(key, t);
    sessionByRole.set(key, s);
  }

  try {
    const arr = JSON.parse(prefs.rolesJson);
    if (Array.isArray(arr)) {
      for (const r of arr) {
        if (typeof r !== "string") continue;
        const t = r.trim();
        if (!t) continue;
        const key = t.toLowerCase();
        if (!rolesSet.has(key)) rolesSet.set(key, t);
      }
    }
  } catch {
    /* noop */
  }

  const roles: string[] = Array.from(rolesSet.values());
  if (roles.length === 0) return;

  // Malformed or missing geographic preferences require review, never a wider search.
  const locationPrefs = parsePreferenceList(prefs.locationsJson);
  if (!locationPrefs?.length) return;

  // Daily cap = quante già create oggi
  // Le candidature fallite (annuncio chiuso, form rotto, crediti) NON
  // consumano cap/quota: l'utente non ha ricevuto nulla.
  const todayCount = await prisma.application.count({
    where: { userId: user.id, createdAt: { gte: todayStart }, status: { notIn: ["failed", "diagnostic"] } },
  });
  if (isApplicationAccessPaused(user)) {
    stats.skippedMonthlyPaywall++;
    return;
  }
  // Una prova senza metodo di pagamento non può consumare crediti o creare
  // candidature: l'utente deve prima completare il checkout Stripe.
  if (requiresPaymentMethodBeforeApp(user)) {
    stats.skippedMonthlyPaywall++;
    return;
  }
  const dailyLimit = dailyApplicationLimit(user, prefs.dailyCap);
  let remainingToday = Math.max(0, dailyLimit - todayCount);
  if (remainingToday === 0) {
    stats.skippedDailyCap++;
    return;
  }

  // Paywall mensile (Free fuori prova = view-only; Pro/Pro+ = più alto)
  const tier = effectiveTier(user);
  const limits = getLimits(tier);
  if (limits.monthlyApplications !== Infinity) {
    const monthCount = await prisma.application.count({
      where: { userId: user.id, createdAt: { gte: monthlyQuotaSince((user as { quotaResetAt?: Date | null }).quotaResetAt ?? null) }, status: { notIn: ["failed", "diagnostic"] } },
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



  // Job candidati: match su titoli per ciascun ruolo, fonti Greenhouse/Lever
  // (quelli con URL ATS diretto — submit reale funziona). Adzuna è troppo
  // fragile per auto-apply senza intervento utente.
  const jobs = await prisma.job.findMany({
    where: {
      closedAt: null,
      // "linkedin" = job scovato da Apify il cui applyUrl è già stato
      // filtrato a un ATS supportato (vedi linkedin-apify.ts), quindi
      // il submit avviene sul form Greenhouse/Lever/Workable/BambooHR
      // originale — zero automazione su linkedin.com.
      // Adzuna è anti-bot blocked (Cloudflare): page.goto su adzuna.*
      // va in timeout 30s, ogni job sprecato. Solo source nativi.
      source: {
        in: [
          "greenhouse",
          "lever",
          "ashby",
          "smartrecruiters",
          "linkedin",
          "recruitee",
          "personio",
          "teamtailor",
          "bamboohr",
          "breezy",
          "pinpoint",
        ],
      },
      // URL canoniche vanilla: gli adapter Playwright funzionano solo
      // sui domini ATS noti. Aziende con career page custom
      // (es. stripe.com/jobs) falliscono sempre → skip.
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
        { url: { contains: ".recruitee.com" } },
        { url: { contains: "/o/" } },
        { url: { contains: "jobs.personio." } },
        { url: { contains: ".teamtailor.com" } },
        { url: { contains: "/jobs/" } },
        { url: { contains: ".bamboohr.com/careers/" } },
        { url: { contains: ".breezy.hr/p/" } },
        { url: { contains: ".pinpointhq.com/postings/" } },
      ],
      // Match title largo: per ogni ruolo, title deve contenere TUTTI
      // i token significativi (≥3 char). Es: "Product Designer" matcha
      // "Senior Product Designer", "Product Design Lead", "Designer
      // Product Innovation". Il post-filter titleMatchesAnyRole con
      // stemming garantisce ulteriore precisione.
      AND: [
        {
          OR: roles.slice(0, 5).map((r) => ({
            AND: r
              .split(/\s+/)
              .filter((tok) => tok.length >= 3)
              .map((tok) => ({
                title: { contains: tok, mode: "insensitive" as const },
              })),
          })),
        },
      ],
      // Skip jobs dove l'utente ha:
      //   - una candidatura consegnata (success) → mai ricandidare
      //   - una in volo (queued/optimizing/applying) → no doppioni
      //   - una in attesa di approvazione (awaiting_consent) → in hybrid
      //     non vogliamo duplicare la stessa suggestion ogni tick
      //   - una qualsiasi recente (< 24h) → cooldown anti-spam-retry
      // I ready_to_apply / failed più vecchi di 24h tornano nel pool ma
      // solo una volta al giorno, non ogni 30 minuti.
      NOT: {
        applications: {
          some: {
            userId: user.id,
            OR: [
              { status: { in: ["success", "queued", "optimizing", "applying", "awaiting_consent"] } },
              { createdAt: { gte: new Date(Date.now() - 12 * 3600_000) } },
            ],
          },
        },
      },
    },
    orderBy: { postedAt: "desc" },
    take: 200, // pesca largo, poi diversifichiamo per azienda lato app
  });

  if (jobs.length === 0) return;

  // Diversificazione: per ogni candidatura già consegnata dall'utente,
  // contiamo quanti invii ha già ricevuto ciascuna azienda. Sortiamo i
  // job in base a (a) candidature passate verso quell'azienda ASC, poi
  // (b) postedAt DESC. Così le aziende mai contattate finiscono prima,
  // e Intercom (20 invii) finisce in fondo. Naturale, niente cap rigido.
  const pastByCompany = await prisma.application.groupBy({
    by: ["jobId"],
    where: { userId: user.id, status: "success" },
    _count: { _all: true },
  });
  const pastJobIds = pastByCompany.map((r) => r.jobId);
  const pastJobs =
    pastJobIds.length > 0
      ? await prisma.job.findMany({
          where: { id: { in: pastJobIds } },
          select: { company: true },
        })
      : [];
  const companyApplyCount = new Map<string, number>();
  for (const j of pastJobs) {
    const c = (j.company ?? "").toLowerCase();
    if (!c) continue;
    companyApplyCount.set(c, (companyApplyCount.get(c) ?? 0) + 1);
  }

  // Pre-calcola match score per ogni job → prima chiave di sort.
  // Diamo prima all'utente i job più congrui al suo profilo (CV + ruoli),
  // così se la quota giornaliera si esaurisce non sprechiamo slot sui
  // match deboli. A parità di score prevalgono i tie-break aziende
  // meno contattate (diversificazione) e postedAt più recente.
  const roleProfileForScore = profile;
  const scoreCache = new Map<string, number>();
  const scoreOf = (j: (typeof jobs)[number]): number => {
    let s = scoreCache.get(j.id);
    if (s === undefined) {
      s = quickMatchScore(
        roleProfileForScore,
        `${j.title}\n${j.company ?? ""}\n${j.description}`,
      );
      scoreCache.set(j.id, s);
    }
    return s;
  };

  jobs.sort((a, b) => {
    // 0. Categorie protette: se l'utente è iscritto (L. 68/99), gli annunci
    //    riservati vengono prima di tutto (sono pochi e a bassa concorrenza).
    if (prefs.protectedCategory) {
      const pa = a.protectedCategory ? 1 : 0;
      const pb = b.protectedCategory ? 1 : 0;
      if (pa !== pb) return pb - pa;
    }
    // 1. Match score DESC (più congruo prima)
    const sb = scoreOf(b);
    const sa = scoreOf(a);
    if (sb !== sa) return sb - sa;
    // 2. Aziende mai contattate prima (diversificazione)
    const ca = companyApplyCount.get((a.company ?? "").toLowerCase()) ?? 0;
    const cb = companyApplyCount.get((b.company ?? "").toLowerCase()) ?? 0;
    if (ca !== cb) return ca - cb;
    // 3. Job più recenti (freschezza)
    const ta = a.postedAt?.getTime() ?? 0;
    const tb = b.postedAt?.getTime() ?? 0;
    return tb - ta;
  });

  // Blacklist aziende strutturalmente non submittabili: 5+ ready_to_apply
  // negli ultimi 30 giorni MA SOLO contando RTA su URL ATS supportati
  // (Greenhouse/Lever/Workable). Le RTA da fallimenti Adzuna timeout
  // non contano: era un problema di resolver, non di company.
  const recentRta = await prisma.application.findMany({
    where: {
      userId: user.id,
      status: "ready_to_apply",
      createdAt: { gte: new Date(Date.now() - 30 * 86400_000) },
      job: {
        OR: [
          { url: { contains: "boards.greenhouse.io" } },
          { url: { contains: "job-boards.greenhouse.io" } },
          { url: { contains: "jobs.lever.co" } },
          { url: { contains: "workable.com/j/" } },
          { url: { contains: "apply.workable.com" } },
        ],
      },
    },
    select: { job: { select: { company: true } } },
  });
  const rtaByCompany = new Map<string, number>();
  for (const r of recentRta) {
    const c = (r.job.company ?? "").toLowerCase();
    if (!c) continue;
    rtaByCompany.set(c, (rtaByCompany.get(c) ?? 0) + 1);
  }
  // Temporaneamente disabilitata mentre debuggo l'adapter Greenhouse
  // (SumUp restituisce ready_to_apply ma URL è vanilla Greenhouse).
  // Riattiveremo dopo aver isolato la causa.
  const blacklistedCompanies = new Set<string>();
  void rtaByCompany;

  // Hard cap per company nel rolling window 30gg.
  // Senza questo, una company con 60 job aperti (es. Wunderman, Dropbox)
  // si prendeva 20+ candidature mentre 50+ altre aziende non vedevano
  // niente.
  //
  // Alzato da 3 → 6: a 3 il pool si esauriva dopo ~30 giorni (ogni
  // azienda matchante saturata, skippedAvoidedCompany dominava il
  // funnel → 0 candidature/giorno). 6 ruoli DIVERSI nella stessa
  // azienda in un mese non è spam — sono posizioni distinte, il
  // recruiting di team diversi non si parla. Raddoppia l'headroom
  // sotto cap senza degradare la qualità percepita dal recruiter.
  const COMPANY_CAP_30D = 6;
  const recentByCompany30d = await prisma.application.groupBy({
    by: ["jobId"],
    where: {
      userId: user.id,
      createdAt: { gte: new Date(Date.now() - 30 * 86400_000) },
      status: { in: ["success", "queued", "optimizing", "applying", "ready_to_apply"] },
    },
    _count: { _all: true },
  });
  const recentJobIds30d = recentByCompany30d.map((r) => r.jobId);
  const recentJobs30d =
    recentJobIds30d.length > 0
      ? await prisma.job.findMany({
          where: { id: { in: recentJobIds30d } },
          select: { company: true },
        })
      : [];
  const companyCount30d = new Map<string, number>();
  for (const j of recentJobs30d) {
    const c = (j.company ?? "").toLowerCase();
    if (!c) continue;
    companyCount30d.set(c, (companyCount30d.get(c) ?? 0) + 1);
  }

  // Per-run: max 1 candidatura per azienda nel primo passaggio, poi
  // se ci sono ancora slot riapriamo. Garantisce che 5 invii in un run
  // tocchino 5 aziende diverse quando possibile.
  const usedThisRun = new Set<string>();
  let enqueued = 0;
  for (const job of jobs) {
    if (enqueued >= remainingToday) break;
    const cKey = (job.company ?? "").toLowerCase();
    if (cKey && usedThisRun.has(cKey)) continue; // pass 1: skip duplicates
    // Hard cap 30gg: max COMPANY_CAP_30D per azienda
    if (cKey && (companyCount30d.get(cKey) ?? 0) >= COMPANY_CAP_30D) {
      stats.skippedAvoidedCompany++;
      continue;
    }
    void cKey;

    const preferenceMismatch = autoApplyPreferenceMismatch(job, prefs, locationPrefs);
    if (preferenceMismatch) {
      if (preferenceMismatch.startsWith("location")) stats.skippedLocationMismatch++;
      if (preferenceMismatch === "employment") stats.skippedEmploymentMismatch++;
      continue;
    }

    // Match STRETTO sul titolo: tutti i token significativi del ruolo
    // devono essere presenti. "Product Designer" → sì "Senior Product
    // Designer", no "Product Engineer".
    if (!titleMatchesAnyRole(job.title, roles)) {
      stats.skippedRoleMismatch++;
      continue;
    }

    // Azienda esclusa esplicitamente?
    if (isAvoidedCompany(job.company, user.avoidCompanies)) {
      stats.skippedAvoidedCompany++;
      continue;
    }

    // Azienda blacklisted (3+ ready_to_apply negli ultimi 30gg)?
    if (
      job.company &&
      blacklistedCompanies.has(job.company.toLowerCase())
    ) {
      stats.skippedAvoidedCompany++;
      continue;
    }

    // Desired roles are search intent, not CV experience or evidence of fit.
    const score = quickMatchScore(
      profile,
      `${job.title}\n${job.company ?? ""}\n${job.description}`,
    );
    if (prefs.matchMin > 0 && score < prefs.matchMin) {
      stats.skippedMatchThreshold++;
      continue;
    }

    // Trova la sessione (round) a cui appartiene questo job. Se è
    // partito da un round attivo (sessionByRole popolato), usa quello.
    // Altrimenti fallback al vecchio resolveSession (backward compat).
    let sessionId: string;
    let sessionStatus: string;
    const matchedRoundRole = roles.find((r) =>
      job.title.toLowerCase().includes(r.toLowerCase()),
    );
    const matchedRound = matchedRoundRole
      ? sessionByRole.get(matchedRoundRole.toLowerCase())
      : null;
    if (matchedRound) {
      sessionId = matchedRound.id;
      sessionStatus = "active";
      // Hard cap: se il round è già al target, salta
      if (matchedRound.sentCount >= matchedRound.targetCount) {
        continue;
      }
    } else {
      const legacy = await resolveSession(user.id, {
        title: job.title,
        category: job.category,
      });
      sessionId = legacy.id;
      sessionStatus = legacy.status;
    }
    if (sessionStatus === "paused") {
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
          status: initialStatus,
          trackingToken: randomToken(),
          atsScore: score,
          sessionId,
        },
      });
      await recordConversionEvent(AnalyticsEvent.APPLICATION_CREATED, {
        userId: user.id,
        properties: { mode: isHybrid ? "hybrid" : "auto", consentRequired: isHybrid },
        dedupeKey: `application_created:${app.id}`,
      });
      // Solo in auto mandiamo subito in coda. In hybrid resta
      // "awaiting_consent" finché l'utente non approva dal dashboard.
      if (!isHybrid) {
        await enqueueApplication(app.id);
        stats.applicationsEnqueued++;
      } else {
        stats.applicationsAwaitingConsent++;
      }
      enqueued++;
      // Marca azienda usata nel run (diversificazione)
      const usedKey = (job.company ?? "").toLowerCase();
      if (usedKey) {
        usedThisRun.add(usedKey);
        // Aggiorna counter 30d in-memory così multi-run consecutivi
        // rispettano il cap senza dover ri-leggere il DB.
        companyCount30d.set(usedKey, (companyCount30d.get(usedKey) ?? 0) + 1);
      }
      // Bump sentCount in-memory così entro lo stesso run il cap
      // targetCount è rispettato. (Il counter persistito viene aggiornato
      // dal worker on-success.)
      if (matchedRound) {
        matchedRound.sentCount = (matchedRound.sentCount ?? 0) + 1;
      }
    } catch (err) {
      console.error(
        `[auto-apply-cron] user ${user.id} job ${job.id} create failed`,
        err,
      );
      stats.errors++;
    }
  }

  // Pass 2: se non abbiamo riempito il cap (poche aziende uniche nel
  // pool), allenta il vincolo e ammetti ripetizioni.
  if (enqueued < remainingToday) {
    for (const job of jobs) {
      if (enqueued >= remainingToday) break;
      if (autoApplyPreferenceMismatch(job, prefs, locationPrefs)) continue;
      // Salta job già processati nel pass 1 (rate-limited per company)
      // — verifichiamo via "applications.some" come per gli altri filtri.
      if (!titleMatchesAnyRole(job.title, roles)) continue;
      if (isAvoidedCompany(job.company, user.avoidCompanies)) continue;
      // Cap 30gg anche nel pass 2: senza questo, riprenderemmo le
      // company già viste pass 1.
      const cKey2 = (job.company ?? "").toLowerCase();
      if (cKey2 && (companyCount30d.get(cKey2) ?? 0) >= COMPANY_CAP_30D)
        continue;

      const score = quickMatchScore(
        profile,
        `${job.title}\n${job.company ?? ""}\n${job.description}`,
      );
      if (prefs.matchMin > 0 && score < prefs.matchMin) continue;

      // Salta se già candidato a questo job (pass 1)
      const exists = await prisma.application.findFirst({
        where: { userId: user.id, jobId: job.id },
        select: { id: true },
      });
      if (exists) continue;

      const matchedRoundRole = roles.find((r) =>
        job.title.toLowerCase().includes(r.toLowerCase()),
      );
      const matchedRound = matchedRoundRole
        ? sessionByRole.get(matchedRoundRole.toLowerCase())
        : null;
      let sessionId: string;
      if (matchedRound) {
        if (matchedRound.sentCount >= matchedRound.targetCount) continue;
        sessionId = matchedRound.id;
      } else {
        const legacy = await resolveSession(user.id, {
          title: job.title,
          category: job.category,
        });
        if (legacy.status === "paused") continue;
        sessionId = legacy.id;
      }

      try {
        const app = await prisma.application.create({
          data: {
            userId: user.id,
            jobId: job.id,
            portal: portalOf(job.url),
            status: initialStatus,
            trackingToken: randomToken(),
            atsScore: score,
            sessionId,
          },
        });
        if (!isHybrid) {
          await enqueueApplication(app.id);
          stats.applicationsEnqueued++;
        } else {
          stats.applicationsAwaitingConsent++;
        }
        enqueued++;
        if (cKey2) {
          companyCount30d.set(cKey2, (companyCount30d.get(cKey2) ?? 0) + 1);
        }
        if (matchedRound) {
          matchedRound.sentCount = (matchedRound.sentCount ?? 0) + 1;
        }
      } catch (err) {
        console.error(
          `[auto-apply-cron] pass2 user ${user.id} job ${job.id} failed`,
          err,
        );
        stats.errors++;
      }
    }
  }
}

function portalOf(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("greenhouse")) return "greenhouse";
  if (u.includes("lever.co")) return "lever";
  if (u.includes("workable.com")) return "workable";
  if (u.includes("ashbyhq.com")) return "ashby";
  if (u.includes("smartrecruiters.com")) return "smartrecruiters";
  if (u.includes("recruitee.com") || /\/o\/[^/]+/.test(u)) return "recruitee";
  if (u.includes("breezy.hr")) return "breezy";
  if (u.includes("pinpointhq.com")) return "pinpoint";
  if (u.includes("personio.")) return "personio";
  if (u.includes("teamtailor.com")) return "teamtailor";
  if (u.includes("bamboohr.com")) return "bamboohr";
  if (u.includes("linkedin")) return "linkedin";
  if (u.includes("indeed")) return "indeed";
  if (u.includes("infojobs")) return "infojobs";
  return "other";
}
