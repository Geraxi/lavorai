import { Prisma, type PrismaClient } from "@prisma/client";
import { applicationDeliveryView } from "./application-delivery-view";
import { pipelineLane, type PipelineLane } from "./application-pipeline";
import { applicationStage, isInterviewEvidence } from "./application-stage";
import type { JourneyStage } from "./ui-application-status";

export const evidenceSelect = {
  id: true, createdAt: true, status: true, userStatus: true, lastReplyKind: true,
  submittedVia: true, submitConfirmation: true, submissionReceiptJson: true,
  emailAttempts: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1,
    select: { status: true, providerEmailId: true } },
} satisfies Prisma.ApplicationSelect;

type Database = Pick<PrismaClient, "application" | "$queryRaw">;
export type IndexRow = { id: string; stage: PipelineLane; journey: JourneyStage | null; pending: boolean; confirmed: boolean; interview: boolean; offer: boolean };
type Entry = { revision: string; expires: number; rows: Promise<IndexRow[] | null>; size: number };
const caches = new WeakMap<Database, Map<string, Entry>>();
const MAX_ROWS = 50_000;
const MAX_ENTRIES = 16;
const MAX_CACHED_ROWS = 100_000;
export const EVIDENCE_BATCH_SIZE = 500;

/** The checksum covers exactly the inputs to the canonical delivery/lane rules,
 * including the latest email attempt, insertions, deletions and filtered job
 * membership. No timestamp-only invalidation: Application has no updatedAt.
 * Only this digest crosses the wire on warm navigation. Counts never use a TTL
 * as a substitute for checking current evidence. No document/customer bodies. */
export function applicationIndexRevisionQuery(filter: { userId: string; since: Date | null; search: string; includeAll: boolean }) {
  // Match Prisma contains semantics, including its LIKE wildcards/escapes.
  const pattern = `%${filter.search}%`;
  return Prisma.sql`
    SELECT count(*)::int AS total,
      md5(COALESCE(string_agg(md5(jsonb_build_array(
        a.id, a."createdAt", a.status, a."userStatus", a."lastReplyKind",
        a."submittedVia", a."submitConfirmation", a."submissionReceiptJson",
        e.status, e."providerEmailId")::text), '' ORDER BY a."createdAt" DESC, a.id DESC), '')) AS revision
    FROM "Application" a
    LEFT JOIN LATERAL (
      SELECT status, "providerEmailId" FROM "ApplicationEmailAttempt"
      WHERE "applicationId" = a.id ORDER BY "createdAt" DESC, id DESC LIMIT 1
    ) e ON true
    WHERE a."userId" = ${filter.userId}
      AND ${filter.includeAll ? Prisma.sql`a.status <> 'diagnostic'` : Prisma.sql`a.status = 'success' AND a."submittedVia" IS NOT NULL`}
      ${filter.since ? Prisma.sql`AND a."createdAt" >= ${filter.since}` : Prisma.empty}
      ${filter.search ? Prisma.sql`AND EXISTS (SELECT 1 FROM "Job" j WHERE j.id = a."jobId" AND
        (j.title ILIKE ${pattern} OR j.company ILIKE ${pattern} OR j.location ILIKE ${pattern}))` : Prisma.empty}`;
}

/** Canonical per-row classification shared by the cached index and the cold
 * fallback scan. Journey stage, confirmation and interview evidence come from
 * the shared stage rules (src/lib/application-stage.ts, re-exported by
 * dashboard-metrics-shared), so Candidature counts match the dashboard. */
export function indexRow(app: { id: string; status: string; userStatus: string | null; lastReplyKind: string | null; submittedVia: string | null;
  submitConfirmation: string | null; submissionReceiptJson: string | null; emailAttempts: { status: string; providerEmailId: string | null }[] },
  delivery: ReturnType<typeof applicationDeliveryView>): IndexRow {
  const journey = applicationStage(app);
  return { id: app.id, stage: pipelineLane({ ...app, delivery }), journey,
    pending: !["confirmed", "delivered", "manual"].includes(delivery.phase),
    confirmed: journey === "sent", interview: isInterviewEvidence(app), offer: app.userStatus === "offerta" };
}

/** Cache compact IDs/classifications only, isolated by client, owner and filters.
 * Pages, view and lane deliberately share the same verified index. A cold
 * instance is correct; concurrent fills coalesce; failures are never cached. */
export async function applicationListIndex(db: Database, where: Prisma.ApplicationWhereInput,
  filter: Parameters<typeof applicationIndexRevisionQuery>[0]): Promise<IndexRow[] | null> {
  const [version] = await db.$queryRaw<Array<{ revision: string; total: number }>>(applicationIndexRevisionQuery(filter));
  if (version.total > MAX_ROWS) return null; // retain streaming bounded fallback for exceptionally large histories
  let cache = caches.get(db);
  if (!cache) { cache = new Map(); caches.set(db, cache); }
  // Rolling week/month boundaries change on every request. The digest already
  // validates their exact membership; do not turn each millisecond into a miss.
  const key = JSON.stringify([filter.userId, filter.search, filter.includeAll]);
  const time = Date.now();
  for (const [key, entry] of cache) if (entry.expires <= time) cache.delete(key);
  const hit = cache.get(key);
  if (hit?.revision === version.revision) return hit.rows;
  cache.delete(key);
  while (cache.size >= MAX_ENTRIES || [...cache.values()].reduce((sum, entry) => sum + entry.size, 0) + version.total > MAX_CACHED_ROWS) {
    cache.delete(cache.keys().next().value!);
  }
  const entry: Entry = { revision: version.revision, expires: time + 60_000, size: version.total, rows: Promise.resolve([]) };
  entry.rows = (async () => {
    const rows: IndexRow[] = [];
    let cursor: { createdAt: Date; id: string } | undefined;
    while (true) {
      const batch = await db.application.findMany({ where: cursor ? { AND: [where, {
        OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
      }] } : where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: EVIDENCE_BATCH_SIZE, select: evidenceSelect });
      for (const app of batch) {
        const delivery = applicationDeliveryView(app);
        rows.push(indexRow(app, delivery));
      }
      // Concurrent inserts cannot let a cache entry grow without bound.
      if (rows.length > MAX_ROWS) { if (cache.get(key) === entry) cache.delete(key); return null; }
      if (batch.length < EVIDENCE_BATCH_SIZE) break;
      cursor = batch[batch.length - 1];
    }
    return rows;
  })();
  cache.set(key, entry);
  try {
    const rows = await entry.rows;
    return rows;
  } catch (error) { if (cache.get(key) === entry) cache.delete(key); throw error; }
}
