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
import { classifyReply } from "@/lib/reply-parser";
import { applyReplyToApplication } from "@/lib/apply-reply-to-application";
import { isLikelyJobMail, matchToApplication } from "@/lib/gmail-match";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: { name: string; value: string }[];
    parts?: { mimeType?: string; body?: { data?: string; size?: number } }[];
    body?: { data?: string; size?: number };
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
    select: { access_token: true, refresh_token: true, expires_at: true },
  });
  if (!account?.access_token) return null;

  const now = Math.floor(Date.now() / 1000);
  if (account.expires_at && account.expires_at > now + 60) {
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
      console.error("[gmail] Token refresh failed:", await refreshResponse.text());
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
  } catch (err) {
    console.error("[gmail] Token refresh error:", err);
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
    throw new Error(`Gmail API error: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function fetchGmailMessageById(accessToken: string, messageId: string): Promise<GmailMessage> {
  const url = `${GMAIL_API_BASE}/users/me/messages/${messageId}?format=full`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Gmail API error: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

function parseGmailMessage(msg: GmailMessage): {
  from: string;
  to: string;
  subject: string;
  date: Date;
  bodyText: string;
  snippet: string;
} {
  const headers = msg.payload?.headers || [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

  const from = getHeader("from");
  const to = getHeader("to");
  const subject = getHeader("subject");
  const dateStr = getHeader("date");
  const date = dateStr ? new Date(dateStr) : new Date(parseInt(msg.internalDate || "0", 10));
  const snippet = msg.snippet || "";

  let bodyText = "";
  const parts = msg.payload?.parts || [];
  const bodyPart = parts.find((p) => p.mimeType === "text/plain");
  if (bodyPart?.body?.data) {
    bodyText = Buffer.from(bodyPart.body.data, "base64").toString("utf-8");
  } else if (msg.payload?.body?.data) {
    bodyText = Buffer.from(msg.payload.body.data, "base64").toString("utf-8");
  } else {
    bodyText = snippet;
  }

  return { from, to, subject, date, bodyText: bodyText.slice(0, 5000), snippet };
}

export async function syncGmailMessages(
  userId: string,
  maxMessages = 50,
): Promise<{ synced: number; skipped: number; error?: string }> {
  try {
    const accessToken = await getGmailAccessToken(userId);
    if (!accessToken) {
      return { synced: 0, skipped: 0, error: "No Gmail access token (not connected)" };
    }

    const listResponse = await fetchGmailMessages(accessToken, maxMessages);
    if (!listResponse.messages || listResponse.messages.length === 0) {
      return { synced: 0, skipped: 0 };
    }

    let synced = 0;
    let skipped = 0;

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

      if (!isLikelyJobMail(parsed.from, parsed.subject, parsed.bodyText)) {
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

      await prisma.gmailMessage.create({
        data: {
          userId,
          gmailMessageId: msg.id,
          threadId: msg.threadId,
          fromAddress: parsed.from,
          toAddress: parsed.to,
          subject: parsed.subject,
          snippet: parsed.snippet,
          bodyText: parsed.bodyText,
          date: parsed.date,
          kind: classified.kind,
          isHuman: classified.isHuman,
          applicationId,
          label,
          read: false,
          archived: false,
        },
      });

      if (applicationId && (classified.isHuman || classified.kind === "ricevuta")) {
        await applyReplyToApplication({
          applicationId,
          kind: classified.kind,
          isHuman: classified.isHuman,
        });
      }

      synced++;
    }

    return { synced, skipped };
  } catch (err) {
    console.error("[gmail] Sync error:", err);
    return { synced: 0, skipped: 0, error: String(err) };
  }
}

export async function hasGmailConnected(userId: string): Promise<boolean> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { access_token: true, refresh_token: true },
  });
  return !!(account?.access_token || account?.refresh_token);
}
