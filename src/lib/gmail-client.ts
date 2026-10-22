/**
 * Gmail API client wrapper for LavorAI inbox integration.
 * 
 * Fetches recent messages from user's Gmail inbox, filters for likely
 * recruiter/job-related mail, classifies them (interview/rejection/response),
 * and matches them to LavorAI applications when possible.
 * 
 * Uses OAuth tokens from NextAuth Account table (access_token/refresh_token).
 */

import { prisma } from "@/lib/db";
import { isApplicationVerificationMessage } from "@/lib/reply-security-message";
import { emailTransaction } from "@/lib/application-delivery";
import { classifyReply, type ClassifiedReply } from "@/lib/reply-parser";
import { applyReplyToApplication } from "@/lib/apply-reply-to-application";
import { isLikelyJobMail, matchToApplication } from "@/lib/gmail-match";
import { extractGmailBody, type GmailPart } from "@/lib/gmail-body";

/** Login scopes do not authorize reading message bodies. Metadata is insufficient. */
export function hasGmailReadScope(scope: string | null | undefined): boolean {
  return (scope ?? "").split(/\s+/).some(value => [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://mail.google.com/",
  ].includes(value));
}

type GmailAccount = { scope?: string | null; access_token?: string | null;
  refresh_token?: string | null; expires_at?: number | null } | null;

export function gmailConnectionState(account: GmailAccount, now = Date.now()) {
  if (!account) return "not_connected" as const;
  if (!hasGmailReadScope(account.scope)) return "scope_missing" as const;
  if (!(account.refresh_token || (account.access_token && account.expires_at
    && account.expires_at * 1000 > now + 60_000))) return "reconnect_required" as const;
  return "authorized" as const;
}

export function gmailAccountConnected(account: GmailAccount, now = Date.now()): boolean {
  return gmailConnectionState(account, now) === "authorized";
}

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

export async function getGmailAccessToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { access_token: true, refresh_token: true, expires_at: true, scope: true },
  });
  if (!account || !gmailAccountConnected(account)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (account.access_token && account.expires_at && account.expires_at > now + 60) {
    return account.access_token;
  }

  if (!account.refresh_token) {
    console.warn("[gmail] Access token expired but no refresh_token available");
    return null;
  }

  try {
    const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: account.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    if (!refreshResponse.ok) {
      console.error("[gmail] Token refresh failed:", refreshResponse.status);
      return null;
    }

    const data = await refreshResponse.json();
    const newAccessToken = data.access_token as string;
    const expiresIn = (data.expires_in as number) || 3600;
    const newExpiresAt = Math.floor(Date.now() / 1000) + expiresIn;

    await prisma.account.updateMany({
      where: { userId, provider: "google" },
      data: { access_token: newAccessToken, expires_at: newExpiresAt },
    });

    return newAccessToken;
  } catch {
    console.error("[gmail] Token refresh failed");
    return null;
  }
}

async function fetchGmailMessages(
  accessToken: string,
  maxResults = 50,
  pageToken?: string,
): Promise<GmailListResponse> {
  const url = new URL(`${GMAIL_API_BASE}/users/me/messages`);
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("labelIds", "INBOX");
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Gmail API error: ${response.status}`);
  }

  return response.json();
}

async function fetchGmailMessageById(accessToken: string, messageId: string): Promise<GmailMessage> {
  const url = `${GMAIL_API_BASE}/users/me/messages/${messageId}?format=full`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Gmail API error: ${response.status}`);
  }

  return response.json();
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

export async function syncGmailMessages(
  userId: string,
  maxMessages = 50,
): Promise<{ synced: number; skipped: number; error?: string }> {
  let synced = 0;
  let skipped = 0;
  try {
    const accessToken = await getGmailAccessToken(userId);
    if (!accessToken) {
      return { synced: 0, skipped: 0, error: "Gmail non autorizzato o sessione scaduta. Ricollega Gmail per sincronizzare le risposte." };
    }

    const listResponse = await fetchGmailMessages(accessToken, maxMessages);
    if (!listResponse.messages || listResponse.messages.length === 0) {
      return { synced: 0, skipped: 0 };
    }

    for (const msgRef of listResponse.messages) {
      const existing = await prisma.gmailMessage.findUnique({
        where: { userId_gmailMessageId: { userId, gmailMessageId: msgRef.id } },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const msg = await fetchGmailMessageById(accessToken, msgRef.id);
      const parsed = parseGmailMessage(msg);

      if (isApplicationVerificationMessage({ fromAddress: parsed.from, subject: parsed.subject, bodyText: parsed.bodyText }) || parsed.ownForwardNotification || !isLikelyJobMail(parsed.from, parsed.subject, parsed.bodyText)) {
        skipped++;
        continue;
      }

      const classified = classifyReply({
        fromAddress: parsed.from,
        subject: parsed.subject,
        bodyText: parsed.bodyText,
      });

      const applicationId = await matchToApplication(
        userId,
        parsed.from,
        parsed.subject,
        parsed.bodyText,
      );

      const labelMap: Record<string, string> = {
        colloquio: "Interview invitation",
        rifiutata: "Not this time",
        risposta: "Response",
        ricevuta: "Application Confirmation",
        auto: "Auto-reply",
        bounce: "Bounce",
      };
      const label = labelMap[classified.kind] || null;

      const stored = await storeGmailReply({ userId, gmailMessageId: msg.id, threadId: msg.threadId,
        parsed, classified, applicationId, label });
      if (stored) synced++; else skipped++;
    }

    return { synced, skipped };
  } catch {
    console.error("[gmail] Sync failed");
    return { synced, skipped, error: "Gmail synchronization failed; please retry." };
  }
}

export async function getGmailConnectionStatus(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { access_token: true, refresh_token: true, expires_at: true, scope: true },
  });
  const state = gmailConnectionState(account);
  return { connected: state === "authorized", state };
}

export async function hasGmailConnected(userId: string): Promise<boolean> {
  return (await getGmailConnectionStatus(userId)).connected;
}
