import { prisma } from "@/lib/db";
import { rowToProfile } from "@/lib/cv-profile-types";
import { quickMatchScore } from "@/lib/match-score";
import { enqueueApplication } from "@/lib/application-queue";
import { resolveSession } from "@/lib/apply-session";
import { effectiveTier, getLimits } from "@/lib/billing";
import { titleMatchesAnyRole } from "@/lib/role-match";
import { runSelfHeal } from "@/lib/auto-apply-self-heal";

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

/**
 * Espande una preferenza di location utente in un set di matcher case-
 * insensitive che applichiamo contro `job.location`. Logica:
 *   - "Milan" → ["milan", "milano"]
 *   - "Dubai/UAE" → ["dubai", "uae", "united arab emirates", "emirates"]
 *   - "Roma" → ["rome", "roma"]
 *   - "Remote" → ["remote", "remoto", "anywhere"]
 *   - "Italy" → ["italy", "italia", "milano", "roma", "torino", "milan", "rome"]
 *   - "EU" / "Europe" → ["europe", "eu", "united kingdom", "germany", ...] (broad)
 * Inoltre, qualsiasi job con `remote: true` qualifica sempre se la
 * lista preferenze contiene almeno una location "fisica" non-remote
 * — perché remote-friendly è una superset di qualunque città scelta.
 */
export function expandLocationPref(loc: string): string[] {
  const k = loc.trim().toLowerCase();
  const aliases: Record<string, string[]> = {
    milan: ["milan", "milano", "lombardia"],
    milano: ["milan", "milano", "lombardia"],
    rome: ["rome", "roma", "lazio"],
    roma: ["rome", "roma", "lazio"],
    turin: ["turin", "torino", "piemonte"],
    torino: ["turin", "torino", "piemonte"],
    bologna: ["bologna", "emilia"],
    naples: ["naples", "napoli", "campania"],
    napoli: ["naples", "napoli", "campania"],
    florence: ["florence", "firenze", "toscana"],
    firenze: ["florence", "firenze", "toscana"],
    italy: [
      "italy", "italia", "milan", "milano", "rome", "roma",
      "turin", "torino", "bologna", "naples", "napoli",
      "florence", "firenze", "lombardia", "lazio", "veneto",
    ],
    italia: [
      "italy", "italia", "milan", "milano", "rome", "roma",
      "turin", "torino", "bologna", "naples", "napoli",
      "florence", "firenze",
    ],
    dubai: ["dubai", "uae", "united arab emirates", "emirates", "abu dhabi"],
    "dubai/uae": ["dubai", "uae", "united arab emirates", "emirates", "abu dhabi"],
    uae: ["dubai", "uae", "united arab emirates", "emirates", "abu dhabi"],
    remote: ["remote", "remoto", "anywhere", "worldwide", "fully remote"],
    remoto: ["remote", "remoto", "anywhere", "fully remote"],
    europe: [
      "europe", "eu", "european union", "remote eu", "europe remote",
      "berlin", "london", "amsterdam", "paris", "madrid", "barcelona",
      "dublin", "lisbon", "warsaw", "prague",
    ],
    eu: [
      "europe", "eu", "european union", "remote eu",
      "berlin", "london", "amsterdam", "paris", "madrid",
    ],
  };
  if (aliases[k]) return aliases[k];
  // Fallback: ritorna la stringa così com'è (lowercase).
  return [k];
}

/**
 * Test: l'utente accetta questo job in base alle sue location pref?
 *   - Nessuna pref impostata → true (back-compat, niente filtro)
 *   - `job.remote === true` → true (remote = superset di qualsiasi città)
 *   - `job.location` contiene almeno un alias di qualsiasi pref → true
 *   - Altrimenti false
 */
export function jobMatchesLocationPrefs(
  job: { location: string | null; remote: boolean },
  prefs: string[],
): boolean {
  if (prefs.length === 0) return true;
  // Job esplicitamente remoto: ok per qualunque preferenza fisica
  // (a meno che l'utente abbia chiesto SOLO un'area specifica E
  // marcato esplicitamente "no remote" — non supportato oggi).
  if (job.remote) return true;
  const haystack = (job.location ?? "").toLowerCase();
  if (!haystack) return false; // no location → no match (defensive)
  for (const p of prefs) {
    for (const alias of expandLocationPref(p)) {
      if (haystack.includes(alias)) return true;
    }
  }
  return false;
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
  skippedEmploymentMismatch: number;
  skippedLocationMismatch: number;
  errors: number;
}

export async function runAutoApplyCron(): Promise<RunStats> {
  // Self-heal PRIMA di processare gli utenti: archivia sessioni garbage,
  // re-enqueue stuck apps, auto-lower matchMin per zero-throughput, alert
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
    skippedEmploymentMismatch: 0,
    skippedLocationMismatch: 0,
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
          employmentType: true,
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
      employmentType: string;
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

  // Parsing preferenze di location. Bug pre-fix: questo campo veniva
  // letto in select ma MAI usato nel filtro → utente impostava "Milan,
  // Dubai/UAE" e si vedeva candidato a job in Berlino o San Francisco.
  // Ora applichiamo `jobMatchesLocationPrefs` nel loop per ogni job.
  let locationPrefs: string[] = [];
  try {
    const arr = JSON.parse(prefs.locationsJson);
    if (Array.isArray(arr)) {
      locationPrefs = arr
        .filter((l): l is string => typeof l === "string")
        .map((l) => l.trim())
        .filter(Boolean);
    }
  } catch {
    /* noop — locationsJson malformato, niente filtro location */
  }

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
      // Adzuna è anti-bot blocked (Cloudflare): page.goto su adzuna.*
      // va in timeout 30s, ogni job sprecato. Solo source nativi.
      source: {
        in: [
          "greenhouse",
          "lever",
          "ashby",
          "smartrecruiters",
          "linkedin",
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
      //   - una qualsiasi recente (< 24h) → cooldown anti-spam-retry
      // I ready_to_apply / failed più vecchi di 24h tornano nel pool ma
      // solo una volta al giorno, non ogni 30 minuti.
      NOT: {
        applications: {
          some: {
            userId: user.id,
            OR: [
              { status: { in: ["success", "queued", "optimizing", "applying"] } },
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

  jobs.sort((a, b) => {
    const ca = companyApplyCount.get((a.company ?? "").toLowerCase()) ?? 0;
    const cb = companyApplyCount.get((b.company ?? "").toLowerCase()) ?? 0;
    if (ca !== cb) return ca - cb; // mai contattate per prime
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
  // niente. Limite ragionevole: 3 candidature/azienda/30gg = abbastanza
  // per coprire i ruoli più rilevanti senza spam.
  const COMPANY_CAP_30D = 3;
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

    // Filtro location: skippa job fuori dalle aree preferite dall'utente.
    // Remote-friendly job (job.remote === true) passano sempre. Vedi
    // expandLocationPref per gli alias multi-lingua (Milan↔Milano,
    // Dubai↔UAE, Italy → tutte le maggiori città italiane, ecc.).
    if (
      locationPrefs.length > 0 &&
      !jobMatchesLocationPrefs(
        { location: job.location, remote: job.remote },
        locationPrefs,
      )
    ) {
      stats.skippedLocationMismatch++;
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
    if (job.company && avoidSet.has(job.company.toLowerCase())) {
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

    // Filtro tipologia contratto (employee/piva/both).
    // Usiamo il titolo + descrizione + contractType come segnali.
    const emp = prefs.employmentType ?? "employee";
    if (emp !== "both") {
      const haystack =
        `${job.title} ${job.contractType ?? ""} ${job.description ?? ""}`
          .toLowerCase()
          .slice(0, 1500);
      const isFreelance =
        /\b(freelance|freelancer|contract|contractor|p\.?\s?iva|partita\s?iva|consultant|consulente|project-based|ad hoc|short[-\s]?term|6\s?months?|12\s?months?)\b/.test(
          haystack,
        );
      if (emp === "piva" && !isFreelance) {
        stats.skippedEmploymentMismatch++;
        continue;
      }
      if (emp === "employee" && isFreelance) {
        stats.skippedEmploymentMismatch++;
        continue;
      }
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
      continue;
    }

    // Salary filter (se impostato)
    if (prefs.salaryMin > 0) {
      const salaryCap = prefs.salaryMin * 1000;
      const jobTop = job.salaryMax ?? job.salaryMin ?? 0;
      if (jobTop > 0 && jobTop < salaryCap) continue;
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
          status: "queued",
          trackingToken: randomToken(),
          atsScore: score,
          sessionId,
        },
      });
      await enqueueApplication(app.id);
      enqueued++;
      stats.applicationsEnqueued++;
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
      // Salta job già processati nel pass 1 (rate-limited per company)
      // — verifichiamo via "applications.some" come per gli altri filtri.
      if (!titleMatchesAnyRole(job.title, roles)) continue;
      if (job.company && avoidSet.has(job.company.toLowerCase())) continue;
      // Cap 30gg anche nel pass 2: senza questo, riprenderemmo le
      // company già viste pass 1.
      const cKey2 = (job.company ?? "").toLowerCase();
      if (cKey2 && (companyCount30d.get(cKey2) ?? 0) >= COMPANY_CAP_30D)
        continue;

      const score = quickMatchScore(
        scoreProfileForRoles(profile, roles),
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
            status: "queued",
            trackingToken: randomToken(),
            atsScore: score,
            sessionId,
          },
        });
        await enqueueApplication(app.id);
        enqueued++;
        stats.applicationsEnqueued++;
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

/**
 * Pass2 helper — produce un profilo arricchito con i ruoli dichiarati
 * (stesso del primo passaggio, definito inline lì).
 */
function scoreProfileForRoles(
  profile: ReturnType<typeof rowToProfile>,
  roles: string[],
): Parameters<typeof quickMatchScore>[0] {
  return {
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
}

function portalOf(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("greenhouse")) return "greenhouse";
  if (u.includes("lever.co")) return "lever";
  if (u.includes("workable.com")) return "workable";
  if (u.includes("ashbyhq.com")) return "ashby";
  if (u.includes("smartrecruiters.com")) return "smartrecruiters";
  if (u.includes("linkedin")) return "linkedin";
  if (u.includes("indeed")) return "indeed";
  if (u.includes("infojobs")) return "infojobs";
  return "other";
}
