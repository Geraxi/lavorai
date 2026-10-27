/**
 * Gmail API client wrapper for LavorAI inbox integration.
 * 
 * Fetches recent messages from user's Gmail inbox, filters for likely
 * recruiter/job-related mail, classifies them (interview/rejection/response),
 * and matches them to LavorAI applications when possible.
 * 
 * Uses OAuth tokens from NextAuth Account table (access_token/refresh_token).
 */

import { gmailConnectionState, GmailSyncError, gmailRequestSignal, refreshFailure } from "@/lib/gmail-sync-policy";
import { claimGmailProgress, saveGmailProgress, releaseGmailProgress, gmailDeferredError, type GmailProgress } from "@/lib/gmail-sync-progress";
import { prisma } from "@/lib/db";
import { isApplicationVerificationMessage } from "@/lib/reply-security-message";
import { emailTransaction } from "@/lib/application-delivery";
import { classifyReply, type ClassifiedReply } from "@/lib/reply-parser";
import { applyReplyToApplication } from "@/lib/apply-reply-to-application";
import { isLikelyJobMail, matchToApplication } from "@/lib/gmail-match";
import { extractGmailBody, type GmailPart } from "@/lib/gmail-body";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart & {
    headers?: { name: string; value: string }[];
  };
}

interface GmailListResponse {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

type GoogleAccount = { id: string; scope: string | null; access_token: string | null; refresh_token: string | null; expires_at: number | null };

async function tokenForAccount(account: GoogleAccount, deadline: number): Promise<string> {
  const state = gmailConnectionState(account);
  if (state !== "ready") throw new GmailSyncError(state);
  if (account.access_token && account.expires_at && account.expires_at * 1000 > Date.now() + 60_000) return account.access_token;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new GmailSyncError("server_configuration");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", signal: gmailRequestSignal(deadline),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret,
      refresh_token: account.refresh_token!, grant_type: "refresh_token" }),
  });
  const data = await response.json();
  if (!response.ok) throw new GmailSyncError(refreshFailure(response.status, data.error));
  if (typeof data.access_token !== "string" || !data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new GmailSyncError("temporary");
  // Do not overwrite another OAuth callback or another Google account's grant.
  const updated = await prisma.account.updateMany({
    where: { id: account.id, refresh_token: account.refresh_token, access_token: account.access_token, expires_at: account.expires_at },
    data: { access_token: data.access_token, expires_at: Math.floor(Date.now() / 1000) + data.expires_in },
  });
  if (updated.count !== 1) throw new GmailSyncError("temporary");
  return data.access_token;
}

export function parseGmailMessage(msg: GmailMessage): {
  from: string;
  to: string;
  subject: string;
  date: Date;
  bodyText: string;
  snippet: string;
  ownForwardNotification?: boolean;
} {
  const headers = msg.payload?.headers || [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

  const from = getHeader("from");
  const to = getHeader("to");
  const subject = getHeader("subject");
  const dateStr = getHeader("date");
  const parsedDate = new Date(dateStr || Number(msg.internalDate || Date.now()));
  const date = Number.isFinite(parsedDate.getTime()) ? parsedDate : new Date();
  const snippet = msg.snippet || "";

  const bodyText = extractGmailBody(msg.payload, snippet);

  // Detect our notification on the complete decoded MIME body. Its footer can
  // follow an 8k recruiter reply, beyond the 5k content-retention limit.
  const ownForwardNotification = isOwnForwardNotification(from, bodyText);
  return { from, to, subject, date, bodyText: bodyText.slice(0, 5000), snippet, ownForwardNotification };
}

/** Our own forwarding notification is already in ApplicationReply. Importing it
 * again through Gmail would double-count the same recruiter response.
 */
export function isOwnForwardNotification(from: string, bodyText: string): boolean {
  const mailbox = (value: string): string | undefined => {
    const clean = value.trim();
    // Use the actual mailbox, never an address embedded in a display name.
    return (clean.match(/^[^<>\r\n]*<([^\s<>@,]+@[a-z0-9.-]+)>$/i)?.[1]
      ?? clean.match(/^([^\s<>@,]+@[a-z0-9.-]+)$/i)?.[1])?.toLowerCase();
  };
  const address = mailbox(from);
  const override = mailbox(process.env.RESEND_FROM_OVERRIDE ?? "");
  return !!address && (address === "noreply@lavorai.it" || address === override) && bodyText.includes("Inoltrato da LavorAI.");
}

/** Store source + application projection as one transaction. A provider replay
 * or concurrent sync cannot increment twice, nor leave a stored-but-unapplied row.
 */
export async function storeGmailReply(input: {
  userId: string;
  gmailMessageId: string;
  threadId: string;
  parsed: ReturnType<typeof parseGmailMessage>;
  classified: ClassifiedReply;
  applicationId: string | null;
  label: string | null;
}): Promise<boolean> {
  return emailTransaction(async (tx) => {
    const identity = { userId: input.userId, gmailMessageId: input.gmailMessageId };
    if (await tx.gmailMessage.findUnique({ where: { userId_gmailMessageId: identity } })) return false;
    // Even a matcher bug must never update another account's application.
    const app = input.applicationId ? await tx.application.findFirst({
      where: { id: input.applicationId, userId: input.userId }, select: { id: true },
    }) : null;
    await tx.gmailMessage.create({ data: {
      ...identity, threadId: input.threadId, fromAddress: input.parsed.from, toAddress: input.parsed.to,
      subject: input.parsed.subject, snippet: input.parsed.snippet, bodyText: input.parsed.bodyText,
      date: input.parsed.date, ...input.classified, applicationId: app?.id ?? null,
      label: input.label, read: false, archived: false,
    } });
    if (app) await applyReplyToApplication({ applicationId: app.id, ...input.classified, receivedAt: input.parsed.date }, tx);
    return true;
  });
}

export interface GmailSyncResult { synced: number; skipped: number; complete: boolean; deferred?: boolean; error?: string }

export async function syncGmailMessages(userId: string, maxMessages = 50, deadline = Date.now() + 45_000, accountId?: string): Promise<GmailSyncResult> {
  const result: GmailSyncResult = { synced: 0, skipped: 0, complete: false };
  let progress: GmailProgress | null = null;
  try {
    const accounts = await prisma.account.findMany({ where: { userId, provider: "google", user: { suspendedAt: null } } });
    const account = accounts.find(a => (!accountId || a.id === accountId) && gmailConnectionState(a) === "ready");
    if (!account) {
      result.error = accounts.some(a => gmailConnectionState(a) === "reconnect_required") ? "reconnect_required" : "signin_only";
      return result;
    }
    progress = await claimGmailProgress(account.id);
    if (!progress) return { ...result, deferred: true, error: await gmailDeferredError(account.id) };
    const token = await tokenForAccount(account, deadline);
    const checkResponse = async (response: Response) => {
      if (response.status === 401) {
        if (account.refresh_token) {
          // One refresh on the next bounded slice, without replaying a request
          // within this invocation or discarding page progress.
          await prisma.account.updateMany({ where: { id: account.id, access_token: token }, data: { expires_at: 0 } });
          throw new GmailSyncError("temporary");
        }
        throw new GmailSyncError("reconnect_required");
      }
      if (response.status === 403) {
        const body = await response.json().catch(() => null);
        const reasons = body?.error?.errors?.map((e: { reason?: string }) => e.reason) ?? [];
        throw new GmailSyncError(reasons.includes("insufficientPermissions") ? "reconnect_required" : "temporary");
      }
      if (!response.ok) throw new GmailSyncError("temporary");
    };
    if (progress.scanBefore === null) {
      progress.scanBefore = BigInt(Math.floor(Date.now() / 1000));
      await saveGmailProgress(progress);
    }
    let processed = 0;
    let pages = 0;
    // Bounded slices, durable page + remaining IDs. New mail is caught by the
    // next completed scan; initial scan covers all current INBOX pages.
    while (processed < Math.min(100, Math.max(1, maxMessages)) && Date.now() < deadline - 1_000) {
      if (!progress.messageIds.length) {
        if (pages >= 4) break;
        pages++;
        const url = new URL(`${GMAIL_API_BASE}/users/me/messages`);
        url.searchParams.set("maxResults", "25");
        url.searchParams.set("labelIds", "INBOX");
        let query = `before:${progress.scanBefore}`;
        if (progress.completedBefore !== null) query += ` after:${progress.completedBefore - BigInt(86400)}`;
        url.searchParams.set("q", query);
        if (progress.pageToken) url.searchParams.set("pageToken", progress.pageToken);
        const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` }, signal: gmailRequestSignal(deadline) });
        if (response.status === 400 && progress.pageToken) {
          // Invalid/expired provider cursor: restart the SAME window, never
          // advance the watermark. Transactional message identity deduplicates.
          progress.pageToken = null; progress.nextPageToken = null;
          await saveGmailProgress(progress);
          throw new GmailSyncError("cursor_invalid");
        }
        await checkResponse(response);
        const list: GmailListResponse = await response.json();
        progress.messageIds = (list.messages ?? []).map(m => m.id);
        progress.nextPageToken = list.nextPageToken ?? null;
        await saveGmailProgress(progress);
        if (Date.now() + 200 < deadline) await new Promise(resolve => setTimeout(resolve, 200));
      }
      while (progress.messageIds.length && processed < Math.min(100, Math.max(1, maxMessages))) {
        if (Date.now() >= deadline - 1_000) return { ...result, deferred: true };
        const id = progress.messageIds[0];
        const existing = await prisma.gmailMessage.findUnique({ where: { userId_gmailMessageId: { userId, gmailMessageId: id } }, select: { id: true } });
        if (existing) result.skipped++;
        else {
          const url = `${GMAIL_API_BASE}/users/me/messages/${encodeURIComponent(id)}?format=full`;
          const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: gmailRequestSignal(deadline) });
          if (response.status === 404) result.skipped++; // deleted after listing
          else {
            await checkResponse(response);
            const msg: GmailMessage = await response.json();
            if (msg.id !== id) throw new GmailSyncError("temporary");
            const parsed = parseGmailMessage(msg);
            if (isApplicationVerificationMessage({ fromAddress: parsed.from, subject: parsed.subject, bodyText: parsed.bodyText }) || parsed.ownForwardNotification || !isLikelyJobMail(parsed.from, parsed.subject, parsed.bodyText)) result.skipped++;
            else {
              const classified = classifyReply({ fromAddress: parsed.from, subject: parsed.subject, bodyText: parsed.bodyText });
              const applicationId = await matchToApplication(userId, parsed.from, parsed.subject, parsed.bodyText);
              const labels: Record<string, string> = { colloquio: "Interview invitation", rifiutata: "Not this time", risposta: "Response", ricevuta: "Application Confirmation", auto: "Auto-reply", bounce: "Bounce" };
              const stored = await storeGmailReply({ userId, gmailMessageId: id, threadId: msg.threadId, parsed, classified, applicationId, label: labels[classified.kind] ?? null });
              if (stored) result.synced++; else result.skipped++;
            }
          }
          // Gmail per-user pacing, only after actual message requests.
          if (Date.now() + 200 < deadline) await new Promise(resolve => setTimeout(resolve, 200));
        }
        progress.messageIds.shift(); processed++;
        await saveGmailProgress(progress);
      }
      if (progress.messageIds.length) break;
      if (!progress.nextPageToken) {
        progress.completedBefore = progress.scanBefore;
        progress.scanBefore = null; progress.pageToken = null;
        await saveGmailProgress(progress);
        result.complete = true;
        return result;
      }
      progress.pageToken = progress.nextPageToken; progress.nextPageToken = null;
      await saveGmailProgress(progress);
    }
    result.deferred = true;
  } catch (error) {
    // Fixed codes only: never provider bodies, tokens, request URLs or email.
    result.error = error instanceof GmailSyncError ? error.code : "temporary";
  } finally {
    if (progress) await releaseGmailProgress(progress, result.error ?? null);
  }
  return result;
}

export async function gmailConnectionStatus(userId: string) {
  const accounts = await prisma.account.findMany({ where: { userId, provider: "google" } });
  const eligible = accounts.filter(account => gmailConnectionState(account) !== "signin_only");
  if (!eligible.length) return { connected: false, state: "signin_only", coverage: "INBOX" };
  const rows = await prisma.$queryRaw<Array<{ accountId: string; lastError: string | null; lastAttemptAt: Date | null; completedBefore: bigint | null; scanBefore: bigint | null }>>`
    SELECT p."accountId", p."lastError", p."lastAttemptAt", p."completedBefore", p."scanBefore"
    FROM "GmailSyncProgress" p JOIN "Account" a ON a.id=p."accountId" WHERE a."userId"=${userId} AND a.provider='google'`;
  const account = eligible.find(a => gmailConnectionState(a) === "ready") ?? eligible[0];
  const progress = rows.find(row => row.accountId === account.id);
  const state = gmailConnectionState(account) === "reconnect_required" || progress?.lastError === "reconnect_required" ? "reconnect_required" : "ready";
  return { connected: state === "ready", state, coverage: "INBOX", lastError: progress?.lastError ?? null,
    catchupPending: progress?.scanBefore != null, completedBefore: progress?.completedBefore == null ? null : new Date(Number(progress.completedBefore) * 1000).toISOString() };
}

export async function hasGmailConnected(userId: string): Promise<boolean> {
  return (await gmailConnectionStatus(userId)).connected;
}
