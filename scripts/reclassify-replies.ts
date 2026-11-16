/**
 * OPT-IN maintenance script — NOT run automatically, not part of any cron.
 * Re-runs the current reply classifier over stored ApplicationReply rows and
 * demotes misclassified automated mail (auto-acknowledgements, autoresponders,
 * security codes stored as bounce, newsletters) so they stop counting as
 * recruiter replies. Never promotes a row to human, never sends email.
 *
 *   Dry run (default, read-only):  node --import tsx scripts/reclassify-replies.ts
 *   Apply:  RECLASSIFY_REPLIES_CONFIRM=apply node --import tsx scripts/reclassify-replies.ts --apply
 *
 * Prints ids and kinds only (no bodies or addresses).
 */
import { prisma } from "../src/lib/db";
import { planReplyReclassification } from "../src/lib/reply-reclassify";

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && process.env.RECLASSIFY_REPLIES_CONFIRM !== "apply") {
    throw new Error("Refusing to write: set RECLASSIFY_REPLIES_CONFIRM=apply together with --apply.");
  }
  const replies = await prisma.applicationReply.findMany({
    select: { id: true, applicationId: true, fromAddress: true, subject: true, bodyText: true, kind: true, isHuman: true, isSecurityCode: true, receivedAt: true },
  });
  const applications = await prisma.application.findMany({
    where: { id: { in: [...new Set(replies.map((reply) => reply.applicationId))] } },
    select: { id: true, userStatus: true, replyCount: true, lastReplyKind: true },
  });
  const plan = planReplyReclassification(replies, applications);
  const summary: Record<string, number> = {};
  for (const change of plan.replies) {
    const key = `${change.from.kind}/${change.from.isHuman ? "human" : "auto"} -> ${change.to.kind}/${change.to.isHuman ? "human" : "auto"}${change.to.isSecurityCode ? "/security" : ""}`;
    summary[key] = (summary[key] ?? 0) + 1;
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", scanned: replies.length, replyChanges: plan.replies.length, applicationChanges: plan.applications.length, summary }, null, 2));
  for (const change of plan.applications) console.log(`application ${change.id}: ${JSON.stringify(change.data)}`);
  if (!apply) return;
  for (const change of plan.replies) {
    await prisma.applicationReply.updateMany({
      where: { id: change.id, kind: change.from.kind, isHuman: change.from.isHuman, isSecurityCode: change.from.isSecurityCode },
      data: change.to,
    });
  }
  for (const change of plan.applications) await prisma.application.update({ where: { id: change.id }, data: change.data });
  console.log("applied");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
