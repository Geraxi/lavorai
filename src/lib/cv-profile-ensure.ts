import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isTestAccount } from "@/lib/admin";
import { extractFullProfile } from "@/lib/cv-profile-ai-full";
import { hashUserRef, logCvExtractionFailure } from "@/lib/cv-extraction-log";
import { EMPTY_PROFILE, profileToRow, rowToProfile, type CVProfile } from "@/lib/cv-profile-types";
import { releaseHeldApplicationsForUser } from "@/lib/held-application-release";

/**
 * Creates the structured CVProfile from the CV the user already uploaded,
 * exactly as visiting /cv does (same extractor, same email prefill, no
 * "verified" flag exists or is set). Previously the row only appeared when the
 * user opened /cv, so users who never did were skipped by the auto-apply job
 * and held by the worker as "profile_unverified".
 *
 * Idempotent and conservative:
 *   - a profile with any content (/cv's own emptiness test) is never touched;
 *   - an empty extraction never writes an empty row (it is retried later);
 *   - the write is a compare-and-set, so a concurrent manual edit wins.
 */

type DB = Pick<PrismaClient, "cVProfile" | "cVDocument" | "user">;
type Extract = (cvText: string, userId?: string) => Promise<CVProfile>;

export type EnsureCvProfileResult = "created" | "filled" | "exists" | "no_cv" | "empty_extraction" | "skipped" | "error";

const MIN_CV_TEXT = 50;

/** Same emptiness test as src/app/(app)/cv/page.tsx (seed only when empty). */
export function isEmptyProfile(p: CVProfile): boolean {
  return !p.firstName && !p.lastName && p.experiences.length === 0 && p.education.length === 0 && p.skills.length === 0;
}

/** Content the worker gate accepts as a usable profile. */
function hasUsableContent(p: CVProfile): boolean {
  return !!(p.firstName || p.lastName || p.title || p.summary || p.skills.length || p.experiences.length);
}

/** The quick profile extracted at upload (and shown to the user then). Used
 * only when the full extractor returns nothing. Never invents fields. */
function quickProfileFallback(parsedProfileJson: string | null): CVProfile | null {
  if (!parsedProfileJson) return null;
  try {
    const q = JSON.parse(parsedProfileJson) as Record<string, unknown>;
    const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const p: CVProfile = { ...EMPTY_PROFILE, firstName: s(q.firstName, 80), lastName: s(q.lastName, 80),
      email: s(q.email, 160), phone: s(q.phone, 40), city: s(q.city, 120), title: s(q.title, 120) };
    return hasUsableContent(p) ? p : null;
  } catch { return null; }
}

export async function ensureCvProfileFromUpload(userId: string, opts: {
  db?: DB; extract?: Extract; sessionEmail?: string | null; releaseHeld?: (userId: string) => Promise<number>;
} = {}): Promise<EnsureCvProfileResult> {
  const db = opts.db ?? prisma;
  const extract = opts.extract ?? extractFullProfile;
  try {
    const [existing, cv, user] = await Promise.all([
      db.cVProfile.findUnique({ where: { userId } }),
      db.cVDocument.findFirst({ where: { userId }, orderBy: { createdAt: "desc" },
        select: { extractedText: true, parsedProfileJson: true } }),
      db.user.findUnique({ where: { id: userId }, select: { email: true, suspendedAt: true } }),
    ]);
    if (!user || user.suspendedAt) return "skipped";
    if (existing && !isEmptyProfile(rowToProfile(existing))) return "exists";
    if (!cv || !cv.extractedText || cv.extractedText.trim().length < MIN_CV_TEXT) return "no_cv";

    let profile = await extract(cv.extractedText, userId).catch(() => ({ ...EMPTY_PROFILE }));
    if (!hasUsableContent(profile)) profile = quickProfileFallback(cv.parsedProfileJson) ?? profile;
    if (!hasUsableContent(profile)) return "empty_extraction";
    const email = opts.sessionEmail ?? user.email;
    if (!profile.email && email) profile = { ...profile, email };
    const row = profileToRow(profile);

    let result: EnsureCvProfileResult;
    if (!existing) {
      try {
        await db.cVProfile.create({ data: { userId, ...row } });
        result = "created";
      } catch (err) {
        // Unique(userId): /cv or a parallel run created it first. Theirs wins.
        if ((err as { code?: string })?.code === "P2002") return "exists";
        throw err;
      }
    } else {
      // Compare-and-set on updatedAt: never overwrite an edit made meanwhile.
      const changed = await db.cVProfile.updateMany({ where: { userId, updatedAt: existing.updatedAt }, data: row });
      if (changed.count !== 1) return "exists";
      result = "filled";
    }
    // Rows held as "profile_unverified" can move only if the worker gate will
    // now accept the profile (same content test as currentWorkerIneligibility).
    if (profile.title || profile.summary || profile.skills.length || profile.experiences.length) {
      await (opts.releaseHeld ?? ((id: string) => releaseHeldApplicationsForUser(id, "cv_profile_created")))(userId);
    }
    return result;
  } catch (err) {
    logCvExtractionFailure("cv-profile-ensure", err, { userRef: hashUserRef(userId) });
    return "error";
  }
}

export type CvProfileBackfillReport = {
  candidates: number; created: number; filled: number; exists: number;
  noCv: number; emptyExtraction: number; failed: number; skipped: number; deferred: number;
};

/**
 * Bounded, idempotent backfill for users who uploaded a CV but have no usable
 * profile. Replaces the old 5-per-run self-heal cap (which also re-picked the
 * same failing users first, starving the rest). Order is shuffled per run so a
 * permanently unparseable CV cannot block others; each run stops at `max`
 * users or `budgetMs`, whichever comes first.
 */
export async function backfillMissingCvProfiles(opts: {
  db?: DB; extract?: Extract; max?: number; budgetMs?: number; concurrency?: number;
  random?: () => number; releaseHeld?: (userId: string) => Promise<number>;
} = {}): Promise<CvProfileBackfillReport> {
  const db = opts.db ?? prisma;
  const max = Math.max(1, Math.min(opts.max ?? 25, 200));
  const deadline = Date.now() + Math.max(1_000, opts.budgetMs ?? 120_000);
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 3, 8));
  const report: CvProfileBackfillReport = { candidates: 0, created: 0, filled: 0, exists: 0, noCv: 0, emptyExtraction: 0, failed: 0, skipped: 0, deferred: 0 };

  const users = await db.user.findMany({
    where: { suspendedAt: null, cvDocuments: { some: {} },
      OR: [{ cvProfile: null }, { cvProfile: { firstName: "" } }, { cvProfile: { firstName: "-" } }] },
    select: { id: true, email: true, cvProfile: { select: { firstName: true, lastName: true, email: true, phone: true,
      city: true, title: true, summary: true, experiencesJson: true, educationJson: true, skillsJson: true,
      languagesJson: true, linksJson: true } } },
    take: 1000,
  });
  // Only truly empty profiles: a profile the user filled without a first name is theirs.
  const pending = users.filter((u) => !isTestAccount(u.email) && (!u.cvProfile || isEmptyProfile(rowToProfile(u.cvProfile))));
  const random = opts.random ?? Math.random;
  for (let i = pending.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pending[i], pending[j]] = [pending[j], pending[i]];
  }
  report.candidates = pending.length;
  const batch = pending.slice(0, max);
  report.deferred = pending.length - batch.length;

  let next = 0;
  const work = async () => {
    while (next < batch.length) {
      if (Date.now() > deadline) { report.deferred++; next++; continue; }
      const u = batch[next++];
      const r = await ensureCvProfileFromUpload(u.id, { db, extract: opts.extract, releaseHeld: opts.releaseHeld });
      if (r === "created") report.created++;
      else if (r === "filled") report.filled++;
      else if (r === "exists") report.exists++;
      else if (r === "no_cv") report.noCv++;
      else if (r === "empty_extraction") report.emptyExtraction++;
      else if (r === "skipped") report.skipped++;
      else report.failed++;
    }
  };
  await Promise.all(Array.from({ length: concurrency }, work));
  if (report.candidates) console.log("[cv-profile-backfill]", report);
  return report;
}
