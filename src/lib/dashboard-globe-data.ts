import { prisma } from "@/lib/db";
import { deliveryEvidence, isConfirmedDelivery } from "@/lib/application-evidence";
import { matchCity } from "@/lib/city-centroids";
import { quickMatchScore } from "@/lib/match-score";
import { rowToProfile, type CVProfile } from "@/lib/cv-profile-types";
import { titleMatchesAnyRole } from "@/lib/role-match";
import { angularDistance, PERSON_ANCHOR } from "@/lib/globe-geometry";

/**
 * Layer dati del globo della dashboard utente.
 *
 * Mappa i dati reali di LavorAI in marker geolocalizzati:
 *   job aperti compatibili col profilo      → "open"    (verde)
 *   candidature consegnate                  → "sent"    (blu)
 *   località desiderate (preferenze utente) → "desired" (viola)
 *   posizioni preparate in attesa dell'ok   → "saved"   (ambra)
 *
 * Le coordinate NON sono salvate sui job: `matchCity(job.location)` risolve
 * città/paese → { lat, lng, city, country } (vedi city-centroids.ts). Quando
 * in futuro avremo lat/lng persistite, basta cambiare `geocode()` qui.
 */

export type PinKind = "open" | "sent" | "desired" | "saved";

export interface GlobeJob {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  /** 0-100, null se il profilo CV non è disponibile. */
  match: number | null;
  kind: PinKind;
  /** Link al dettaglio esistente (/jobs/[id]) o alle candidature. */
  href: string;
  isNew: boolean;
}

export interface CityMarker {
  key: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  counts: Record<PinKind, number>;
  /** Migliori annunci in città (per card e cluster), ordinati per match. */
  jobs: GlobeJob[];
  /** Opportunità scoperte nelle ultime 48h (pin che pulsa). */
  isNew: boolean;
}

export interface GlobeStats {
  analyzed: number;
  compatible: number;
  newOpportunities: number;
  counts: Record<PinKind, number>;
}

export interface DashboardGlobeData {
  markers: CityMarker[];
  stats: GlobeStats;
  /** Città con card visibili di default (3-5, lontane dalla persona sdraiata). */
  featuredKeys: string[];
}

interface GeoPoint { key: string; city: string; country: string; lat: number; lng: number }

function geocode(location: string | null | undefined): GeoPoint | null {
  const c = matchCity(location);
  if (!c) return null;
  return { key: c.key, city: c.name, country: c.cc, lat: c.lat, lng: c.lng };
}

function safeParseArray(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// Geometria pura in un modulo a parte, così i client component non importano
// questo file (che porta con sé Prisma). Re-export per i chiamanti server.
export { angularDistance, PERSON_ANCHOR };

export async function getDashboardGlobeData(userId: string): Promise<DashboardGlobeData> {
  const now = Date.now();
  const since30 = new Date(now - 30 * 86400_000);
  const newSince = new Date(now - 48 * 3600_000);

  const [openJobs, sentCandidates, savedApps, prefs, profileRow, analyzed] = await Promise.all([
    // Niente `description` qui: con 4000 righe era il grosso del payload
    // (MB per ogni apertura della dashboard). Il testo serve solo al match
    // score dei ≤600 job del pool e viene letto sotto, solo per quelli.
    prisma.job.findMany({
      where: { closedAt: null, cachedAt: { gte: since30 }, dismissals: { none: { userId } } },
      select: { id: true, title: true, company: true, location: true, cachedAt: true },
      orderBy: { cachedAt: "desc" },
      take: 4000,
    }),
    prisma.application.findMany({
      where: { userId, OR: [{ status: "success" }, { emailAttempts: { some: { status: "delivered", providerEmailId: { not: null } } } }] },
      select: { id: true, userId: true, status: true, submittedVia: true, submitConfirmation: true, submissionReceiptJson: true, createdAt: true,
        emailAttempts: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, providerEmailId: true, acceptedAt: true } },
        job: { select: { id: true, title: true, company: true, location: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.application.findMany({
      where: { userId, status: { in: ["ready_to_apply", "awaiting_consent"] } },
      select: { id: true, createdAt: true, job: { select: { id: true, title: true, company: true, location: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.userPreferences.findUnique({ where: { userId }, select: { rolesJson: true, locationsJson: true } }),
    prisma.cVProfile.findUnique({ where: { userId } }),
    prisma.job.count({ where: { closedAt: null } }),
  ]);

  const roles = safeParseArray(prefs?.rolesJson);
  const desiredLocations = safeParseArray(prefs?.locationsJson).filter((l) => l.toLowerCase() !== "remoto" && l.toLowerCase() !== "remote");
  const profile: CVProfile | null = profileRow ? rowToProfile(profileRow) : null;

  const byCity = new Map<string, CityMarker>();
  const marker = (g: GeoPoint): CityMarker => {
    let m = byCity.get(g.key);
    if (!m) {
      m = { key: g.key, name: g.city, country: g.country, lat: g.lat, lng: g.lng, counts: { open: 0, sent: 0, desired: 0, saved: 0 }, jobs: [], isNew: false };
      byCity.set(g.key, m);
    }
    return m;
  };

  // 1) Opportunità aperte: solo job compatibili coi ruoli scelti (se ci sono),
  //    con match score dal profilo CV. Il match è calcolato solo sui job che
  //    finiscono davvero sul globo (cap) per non pesare sul render.
  const compatible = roles.length ? openJobs.filter((j) => titleMatchesAnyRole(j.title, roles)) : openJobs;
  const pool = compatible.slice(0, 600);
  // Descrizioni solo per i job geolocalizzabili del pool e solo se c'è un
  // profilo CV con cui calcolare il match (senza profilo match = null).
  const descriptions = new Map<string, string>();
  if (profile) {
    const ids = pool.filter((j) => geocode(j.location)).map((j) => j.id);
    if (ids.length) {
      const rows = await prisma.job.findMany({ where: { id: { in: ids } }, select: { id: true, description: true } });
      for (const r of rows) descriptions.set(r.id, r.description);
    }
  }
  let newOpportunities = 0;
  for (const j of pool) {
    const g = geocode(j.location);
    if (!g) continue;
    const m = marker(g);
    m.counts.open++;
    const isNew = j.cachedAt >= newSince;
    if (isNew) { m.isNew = true; newOpportunities++; }
    const match = profile ? quickMatchScore(profile, `${j.title}\n${j.company ?? ""}\n${descriptions.get(j.id) ?? ""}`) : null;
    m.jobs.push({ id: j.id, title: j.title, company: j.company, location: j.location, match, kind: "open", href: `/jobs/${j.id}`, isNew });
  }
  // Conta anche gli aperti fuori dal pool per i totali delle pill
  for (const j of compatible.slice(600)) {
    const g = geocode(j.location);
    if (g) marker(g).counts.open++;
  }

  // 2) Only verified portal receipts or delivered email, never legacy success,
  // provider acceptance, tracking pixels, mock runs or unresolved attempts.
  const sentApps = sentCandidates.filter((application) => application.userId === userId && isConfirmedDelivery(deliveryEvidence(application)));
  for (const a of sentApps) {
    const g = geocode(a.job.location);
    if (!g) continue;
    const m = marker(g);
    m.counts.sent++;
    m.jobs.push({ id: a.job.id, title: a.job.title, company: a.job.company, location: a.job.location, match: null, kind: "sent", href: "/applications", isNew: false });
  }

  // 3) Posizioni preparate in attesa (ambra, "Salvate")
  for (const a of savedApps) {
    const g = geocode(a.job.location);
    if (!g) continue;
    const m = marker(g);
    m.counts.saved++;
    m.jobs.push({ id: a.job.id, title: a.job.title, company: a.job.company, location: a.job.location, match: null, kind: "saved", href: "/applications", isNew: a.createdAt >= newSince });
  }

  // 4) Località desiderate dalle preferenze (viola)
  for (const loc of desiredLocations) {
    const g = geocode(loc);
    if (!g) continue;
    marker(g).counts.desired++;
  }

  // Ordina gli annunci di ogni città: inviate/salvate prima, poi per match.
  const prio: Record<PinKind, number> = { sent: 0, saved: 1, desired: 2, open: 3 };
  for (const m of byCity.values()) {
    m.jobs.sort((a, b) => prio[a.kind] - prio[b.kind] || (b.match ?? 0) - (a.match ?? 0));
    m.jobs = m.jobs.slice(0, 8);
  }

  const markers = [...byCity.values()];

  // Card visibili di default: città più rilevanti, distanti tra loro e dalla persona.
  const score = (m: CityMarker) => m.counts.sent * 100 + m.counts.saved * 60 + m.counts.desired * 40 + (m.jobs[0]?.match ?? 0) + Math.min(m.counts.open, 20);
  const featured: CityMarker[] = [];
  for (const m of [...markers].sort((a, b) => score(b) - score(a))) {
    if (featured.length >= 4) break;
    if (m.jobs.length === 0) continue;
    if (angularDistance(m.lat, m.lng, PERSON_ANCHOR.lat, PERSON_ANCHOR.lng) < 38) continue;
    if (featured.some((f) => angularDistance(f.lat, f.lng, m.lat, m.lng) < 22)) continue;
    featured.push(m);
  }

  const counts: Record<PinKind, number> = { open: 0, sent: 0, desired: 0, saved: 0 };
  for (const m of markers) for (const k of Object.keys(counts) as PinKind[]) counts[k] += m.counts[k];

  return {
    markers,
    featuredKeys: featured.map((f) => f.key),
    stats: { analyzed, compatible: compatible.length, newOpportunities, counts },
  };
}
