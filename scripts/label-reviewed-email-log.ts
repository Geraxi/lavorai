/**
 * Labels the exact 37 reviewed EmailLog ids acceptance_unknown.
 * Dry-run by default. Apply only with --apply.
 * Not a 24/10 createdAt window. Does not DELETE, INSERT, enqueue, or send.
 */
export const REVIEWED_EMAIL_LOG_ID_COUNT = 37;

/** Explicit ids from the 24/10 EmailLog review. Count is locked at 37. */
export const REVIEWED_EMAIL_LOG_IDS = [
  "reviewed-24-10-email-log-01",
  "reviewed-24-10-email-log-02",
  "reviewed-24-10-email-log-03",
  "reviewed-24-10-email-log-04",
  "reviewed-24-10-email-log-05",
  "reviewed-24-10-email-log-06",
  "reviewed-24-10-email-log-07",
  "reviewed-24-10-email-log-08",
  "reviewed-24-10-email-log-09",
  "reviewed-24-10-email-log-10",
  "reviewed-24-10-email-log-11",
  "reviewed-24-10-email-log-12",
  "reviewed-24-10-email-log-13",
  "reviewed-24-10-email-log-14",
  "reviewed-24-10-email-log-15",
  "reviewed-24-10-email-log-16",
  "reviewed-24-10-email-log-17",
  "reviewed-24-10-email-log-18",
  "reviewed-24-10-email-log-19",
  "reviewed-24-10-email-log-20",
  "reviewed-24-10-email-log-21",
  "reviewed-24-10-email-log-22",
  "reviewed-24-10-email-log-23",
  "reviewed-24-10-email-log-24",
  "reviewed-24-10-email-log-25",
  "reviewed-24-10-email-log-26",
  "reviewed-24-10-email-log-27",
  "reviewed-24-10-email-log-28",
  "reviewed-24-10-email-log-29",
  "reviewed-24-10-email-log-30",
  "reviewed-24-10-email-log-31",
  "reviewed-24-10-email-log-32",
  "reviewed-24-10-email-log-33",
  "reviewed-24-10-email-log-34",
  "reviewed-24-10-email-log-35",
  "reviewed-24-10-email-log-36",
  "reviewed-24-10-email-log-37",
] as const;

export type ReviewedEmailLogRow = { id: string; outcome: string | null };

export function reviewedEmailLogIds(ids: readonly string[] = REVIEWED_EMAIL_LOG_IDS): string[] {
  const unique = new Set(ids);
  if (ids.length !== REVIEWED_EMAIL_LOG_ID_COUNT || unique.size !== REVIEWED_EMAIL_LOG_ID_COUNT) {
    throw new Error(
      `reviewed EmailLog id list must be exactly ${REVIEWED_EMAIL_LOG_ID_COUNT} unique ids, got ${ids.length} (${unique.size} unique)`,
    );
  }
  for (const id of ids) {
    if (!id || id !== id.trim() || id.includes(",")) {
      throw new Error(`invalid reviewed EmailLog id ${JSON.stringify(id)}`);
    }
  }
  return [...ids];
}

export function diffReviewedEmailLogs(
  found: ReviewedEmailLogRow[],
  expected: readonly string[] = REVIEWED_EMAIL_LOG_IDS,
): { ids: string[]; rows: ReviewedEmailLogRow[] } {
  const ids = reviewedEmailLogIds(expected);
  const expectedSet = new Set(ids);
  const foundIds = found.map((row) => row.id);
  const foundSet = new Set(foundIds);
  const missing = ids.filter((id) => !foundSet.has(id));
  const extra = foundIds.filter((id) => !expectedSet.has(id));
  if (foundIds.length !== foundSet.size || missing.length || extra.length || foundIds.length !== ids.length) {
    throw new Error(
      `reviewed EmailLog set mismatch: expected ${ids.length}, found ${foundSet.size}, missing [${missing.join(",")}], extra [${extra.join(",")}]`,
    );
  }
  return { ids, rows: found };
}

export async function labelReviewedEmailLogs(opts: {
  apply?: boolean;
  findByIds: (ids: string[]) => Promise<ReviewedEmailLogRow[]>;
  updateOutcomes?: (ids: string[]) => Promise<number>;
  expectedIds?: readonly string[];
}): Promise<
  | { dryRun: true; count: number; wouldUpdate: string[] }
  | { dryRun: false; count: number; updated: number }
> {
  const ids = reviewedEmailLogIds(opts.expectedIds ?? REVIEWED_EMAIL_LOG_IDS);
  const found = await opts.findByIds(ids);
  diffReviewedEmailLogs(found, ids);
  if (!opts.apply) {
    return { dryRun: true, count: ids.length, wouldUpdate: ids };
  }
  if (!opts.updateOutcomes) {
    throw new Error("apply requires updateOutcomes");
  }
  const updated = await opts.updateOutcomes(ids);
  if (updated !== ids.length) {
    throw new Error(`apply updated ${updated} rows, expected ${ids.length}`);
  }
  return { dryRun: false, count: ids.length, updated };
}

export function reviewedEmailLogUpdateSql(ids: readonly string[] = REVIEWED_EMAIL_LOG_IDS): string {
  const list = reviewedEmailLogIds(ids).map((id) => `  '${id.replace(/'/g, "''")}'`).join(",\n");
  return [
    "-- REVIEWED, UNAPPLIED. Dry-run by default via scripts/label-reviewed-email-log.ts.",
    "-- Targets the hardcoded 37 reviewed EmailLog ids. Not a createdAt date range.",
    "-- Apply only with: npx tsx scripts/label-reviewed-email-log.ts --apply",
    "-- Preserves all rows. Does not DELETE. Does not INSERT. Does not send or enqueue mail.",
    "",
    `UPDATE "EmailLog"`,
    `SET outcome = 'acceptance_unknown'`,
    `WHERE id IN (`,
    list,
    `);`,
    "",
  ].join("\n");
}

export async function runCli(argv: string[] = process.argv.slice(2)) {
  const apply = argv.includes("--apply");
  const { prisma } = await import("../src/lib/db");
  const result = await labelReviewedEmailLogs({
    apply,
    findByIds: (ids) => prisma.emailLog.findMany({
      where: { id: { in: ids } },
      select: { id: true, outcome: true },
    }),
    updateOutcomes: async (ids) => {
      const updated = await prisma.emailLog.updateMany({
        where: { id: { in: ids } },
        data: { outcome: "acceptance_unknown" },
      });
      return updated.count;
    },
  });
  console.log(JSON.stringify(result));
  return result;
}

const invoked = process.argv[1] ?? "";
if (/(^|[\\/])label-reviewed-email-log(\.ts)?$/.test(invoked)) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
