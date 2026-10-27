import { gmailConnectionState } from "./gmail-sync-policy";
import type { GmailSyncResult } from "./gmail-client";
export type SyncAccount = { id: string; userId: string; scope: string | null; access_token: string | null; refresh_token: string | null; expires_at: number | null; user: { suspendedAt: Date | null } };
/** Injected clock/sync for hermetic deadline and 264-account regression tests. */
export async function runGmailSync(accounts: SyncAccount[], order: Map<string, number>, sync: (userId: string, count: number, deadline: number, accountId?: string) => Promise<GmailSyncResult>, now = Date.now) {
  const started = now(), deadline = started + 240_000;
  const stats = { usersChecked: accounts.length, usersWithGmail: 0, signinOnly: 0, reconnectRequired: 0, suspended: 0, attempted: 0, completed: 0, deferred: 0, failed: 0, totalSynced: 0, totalSkipped: 0 };
  const eligible: SyncAccount[] = [];
  for (const account of accounts) {
    if (account.user.suspendedAt) { stats.suspended++; continue; }
    const state = gmailConnectionState(account, now());
    if (state === "signin_only") stats.signinOnly++;
    else if (state === "reconnect_required") stats.reconnectRequired++;
    else eligible.push(account);
  }
  stats.usersWithGmail = eligible.length;
  eligible.sort((a,b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0) || a.id.localeCompare(b.id));
  for (const account of eligible) {
    if (now() >= deadline - 5_000) { stats.deferred++; continue; }
    stats.attempted++;
    try {
      const result = await sync(account.userId, 50, Math.min(deadline, now() + 30_000), account.id);
      stats.totalSynced += result.synced; stats.totalSkipped += result.skipped;
      if (result.error === "reconnect_required") stats.reconnectRequired++;
      if (result.error) stats.failed++;
      else if (result.complete) stats.completed++;
      else stats.deferred++;
    } catch { stats.failed++; }
  }
  return { ok: stats.failed === 0 && stats.reconnectRequired === 0, status: stats.failed || stats.reconnectRequired ? "degraded" : stats.deferred ? "partial" : stats.usersWithGmail ? "complete" : "no_connected_mailboxes", ms: now() - started, ...stats };
}
