/**
 * Labels the exact 37 reviewed EmailLog ids acceptance_unknown.
 * Dry-run by default. Apply only with --apply.
 * Not a 24/10 createdAt window. Does not DELETE, INSERT, enqueue, or send.
 */
export const REVIEWED_EMAIL_LOG_ID_COUNT = 37;

/** Explicit ids from the 24/10 EmailLog review. Count is locked at 37. */
export const REVIEWED_EMAIL_LOG_IDS = [
  "cmvlkjpcx06a6l707lvs7skvu",
  "cmvlkq53w06agl707zus6qstv",
  "cmvll2vqy06aml7073hzay637",
  "cmvll9g0j06b0l707s5jkcglx",
  "cmvlny0gs0017ie07a7j1sgj8",
  "cmvlo5558001jie07jyh6xc9h",
  "cmvloapro001zie078thi7nbf",
  "cmvloh8uq0029ie07q9gwdtny",
  "cmvlonkzh002jie072p0nx9ip",
  "cmvm6cb1f06e7l808rf53lqqb",
  "cmvm7et4406egl808m86tzav7",
  "cmvm7y1hq0005lh08cgkydj0t",
  "cmvm84rhq000rlh08eejo12eg",
  "cmvm8b1tm05tclh08c9vxnkkj",
  "cmvm8hclm05tilh08zm1ea9k9",
  "cmvm8npna05u0lh08r9as49v6",
  "cmvm97dr70009l508nk6xb9hs",
  "cmvm9k4wz000fl508xy4xbgc9",
  "cmvm9qi93000pl508z75qq4ou",
  "cmvm9x3sx001bl508prhntfcg",
  "cmvmc2df3001bjp07wm4ws1gd",
  "cmvmc3egz001jjp07z7gwk4bi",
  "cmvmclh8b002gjp071lj7gr1k",
  "cmvmg62i1000bjs076j5sifai",
  "cmvmg7ljt000rjs07lh8if0u8",
  "cmvmg8z3x000xjs07yppnbgqo",
  "cmvmgaa2m0013js07imjbqy3z",
  "cmvmgd7xc0019js071no4gazc",
  "cmvmlcqjw0077l807k87sdwpb",
  "cmvmlduzj007rl807rbc7hip0",
  "cmvmleigx0085l807y477tmfr",
  "cmvmlficr008ll807audfovfy",
  "cmvmlgv8u008vl807iqodokpg",
  "cmvmlj5ml0099l807q0k5nwlc",
  "cmvmxup0v004fi107pgyjxa7i",
  "cmvmxvnao004oi107uteqtlnf",
  "cmvmxvt3f004ri107bnpxbj1j",
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
