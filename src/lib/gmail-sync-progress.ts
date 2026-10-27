import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

export interface GmailProgress {
  accountId: string; leaseToken: string; completedBefore: bigint | null;
  scanBefore: bigint | null; pageToken: string | null;
  messageIds: string[]; nextPageToken: string | null;
}
export async function claimGmailProgress(accountId: string): Promise<GmailProgress | null> {
  // No network/processing inside a transaction. Conflict-safe initialization.
  await prisma.$executeRaw`INSERT INTO "GmailSyncProgress" ("accountId") VALUES (${accountId}) ON CONFLICT DO NOTHING`;
  const token = randomUUID();
  const rows = await prisma.$queryRaw<GmailProgress[]>`
    UPDATE "GmailSyncProgress" SET "leaseToken"=${token}, "leaseUntil"=NOW()+INTERVAL '90 seconds', "lastAttemptAt"=NOW()
    WHERE "accountId"=${accountId} AND ("leaseUntil" IS NULL OR "leaseUntil" < NOW()) AND "nextAttemptAt" <= NOW()
    RETURNING *`;
  return rows[0] ?? null;
}
export async function saveGmailProgress(state: GmailProgress): Promise<void> {
  const changed = await prisma.$executeRaw`
    UPDATE "GmailSyncProgress" SET "completedBefore"=${state.completedBefore}, "scanBefore"=${state.scanBefore},
      "pageToken"=${state.pageToken}, "messageIds"=${state.messageIds}::text[], "nextPageToken"=${state.nextPageToken},
      "leaseUntil"=NOW()+INTERVAL '90 seconds'
    WHERE "accountId"=${state.accountId} AND "leaseToken"=${state.leaseToken} AND "leaseUntil">NOW()`;
  if (changed !== 1) throw new Error("gmail_lease_lost");
}
export async function releaseGmailProgress(state: GmailProgress, error: string | null): Promise<void> {
  const delay = error === "reconnect_required" || error === "server_configuration" ? 3600 : error && error !== "deadline" ? 300 : 0;
  await prisma.$executeRaw`
    UPDATE "GmailSyncProgress" SET "leaseToken"=NULL, "leaseUntil"=NULL, "lastError"=${error},
      "nextAttemptAt"=NOW()+(${delay} * INTERVAL '1 second')
    WHERE "accountId"=${state.accountId} AND "leaseToken"=${state.leaseToken}`;
}
export async function gmailAttemptOrder(): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<Array<{ accountId: string; lastAttemptAt: Date | null }>>`
    SELECT "accountId", "lastAttemptAt" FROM "GmailSyncProgress"`;
  return new Map(rows.map(row => [row.accountId, row.lastAttemptAt?.getTime() ?? 0]));
}

export async function gmailDeferredError(accountId: string): Promise<string | undefined> {
  const rows = await prisma.$queryRaw<Array<{ lastError: string | null }>>`
    SELECT "lastError" FROM "GmailSyncProgress" WHERE "accountId"=${accountId} AND "nextAttemptAt">NOW()`;
  return rows[0]?.lastError ?? undefined;
}
