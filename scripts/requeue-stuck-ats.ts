/**
 * Riaccoda candidature bloccate su ATS supportati ("Portale non supportato")
 * e i fallimenti Claude `not_found_error`. Default: DRY-RUN (sola lettura +
 * controllo liveness HTTP). Scrive solo con --apply.
 *
 *   npx tsx scripts/requeue-stuck-ats.ts                 # dry-run, limit 50
 *   npx tsx scripts/requeue-stuck-ats.ts --limit 200
 *   npx tsx scripts/requeue-stuck-ats.ts --apply --limit 10
 */
import { automaticApplicationsBlocked } from "../src/lib/application-rollout";
import { prisma } from "../src/lib/db";
import { enqueueApplication } from "../src/lib/application-queue";
import { checkJobUrlLiveness, markJobClosed } from "../src/lib/job-liveness";
import { NOT_SUBMITTED } from "../src/lib/application-worker-gates";
import { runStuckAtsRequeue, stuckAtsCandidateWhere, stuckAtsSelect, type StuckAtsRow } from "../src/lib/stuck-ats-requeue";

export function parseArgs(argv: string[]): { apply: boolean; limit: number } {
  const apply = argv.includes("--apply");
  const i = argv.indexOf("--limit");
  const raw = i >= 0 ? Number(argv[i + 1]) : 50;
  if (!Number.isInteger(raw) || raw < 1 || raw > 1000) throw new Error("--limit deve essere un intero 1-1000");
  return { apply, limit: raw };
}

async function main() {
  const { apply, limit } = parseArgs(process.argv.slice(2));
  if (apply && automaticApplicationsBlocked()) throw new Error("automatic_applications_blocked: --apply rifiutato");
  const report = await runStuckAtsRequeue({
    findCandidates: (take) => prisma.application.findMany({
      where: stuckAtsCandidateWhere(), select: stuckAtsSelect, orderBy: { createdAt: "desc" }, take,
    }) as Promise<StuckAtsRow[]>,
    hasSubmittedSibling: async (row) => (await prisma.application.count({ where: {
      userId: row.userId, jobId: row.jobId, id: { not: row.id },
      OR: [{ submittedAt: { not: null } }, { status: { in: ["success", "applying"] } }],
    } })) > 0,
    checkLiveness: checkJobUrlLiveness,
    markJobClosed,
    requeue: async (row) => (await prisma.application.updateMany({
      where: { id: row.id, status: row.status, errorMessage: row.errorMessage, submittedAt: null },
      data: { status: "queued", startedAt: null, completedAt: null, errorMessage: null, submitConfirmation: NOT_SUBMITTED },
    })).count,
    enqueue: (id) => enqueueApplication(id),
    log: (l) => console.log(l),
  }, { apply, limit });
  const { eligibleIds, ...summary } = report;
  console.log(JSON.stringify(summary, null, 2));
  if (!apply) console.log(`DRY-RUN: ${eligibleIds.length} riaccodabili (prime 20): ${eligibleIds.slice(0, 20).join(", ")}`);
}

if (process.argv[1]?.endsWith("requeue-stuck-ats.ts")) {
  main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}
