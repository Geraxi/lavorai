/** Operator-only: no provider calls. Read docs/release-integration-20261023.md. */
import { readFile } from "node:fs/promises";
import { initializeEmailQuota } from "../src/lib/email-dispatch";
import { prisma } from "../src/lib/db";
async function main() {
  const file = process.argv.find(arg => arg.startsWith("--snapshot="))?.slice(11);
  if (!file) throw new Error("Provide --snapshot=<reviewed-provider-usage.json>");
  const input = JSON.parse(await readFile(file, "utf8"));
  const snapshot = { id: input.id, dailyConsumed: input.dailyConsumed, monthlyConsumed: input.monthlyConsumed,
    observedAt: new Date(input.observedAt), dailyResetAt: new Date(input.dailyResetAt), monthlyResetAt: new Date(input.monthlyResetAt) };
  if (!process.argv.includes("--apply")) { console.log("DRY RUN: no database changes. Review snapshot, stop every producer, then explicitly use --apply --producers-quiesced."); return; }
  const row = await initializeEmailQuota(snapshot, process.argv.includes("--producers-quiesced"));
  console.log(JSON.stringify({ id: row.id, snapshotAt: row.snapshotAt, dailyFloor: row.dailyConsumed, monthlyFloor: row.monthlyConsumed, dailyResetAt: row.dailyResetAt, monthlyResetAt: row.monthlyResetAt }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "initialization_failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
