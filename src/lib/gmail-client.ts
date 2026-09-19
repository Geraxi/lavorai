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
import { classifyReply, type ClassifyInput } from "@/lib/reply-parser";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";

/**
 * Scopes required: https://www.googleapis.com/auth/gmail.readonly
 */

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

/**
 * Get valid access token for Gmail API. Refreshes if expired.
 * Returns null if user hasn't connected Gmail (no Google Account with tokens).
 */
export async function getGmailAccessToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { access_token: true, refresh_token: true, expires_at: true },
  });
  if (!account?.access_token) return null;

  // Check if token is expired (expires_at is unix timestamp in seconds)
  const now = Math.floor(Date.now() / 1000);
  if (account.expires_at && account.expires_at > now + 60) {
    // Token still valid for at least 1 minute
    return account.access_token;
  }

  // Token expired or missing expires_at: refresh it
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

    // Update account with new token
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

/**
 * Fetch recent Gmail messages (up to maxResults).
 * Filters for INBOX label (not sent/drafts/spam).
 */
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

/**
 * Fetch full message details by ID.
 */
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

/**
 * Parse Gmail message payload to extract headers and body text.
 */
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

  // Extract text body (prefer text/plain, fallback to html stripped)
  let bodyText = "";
  const parts = msg.payload?.parts || [];
  const bodyPart = parts.find((p) => p.mimeType === "text/plain");
  if (bodyPart?.body?.data) {
    bodyText = Buffer.from(bodyPart.body.data, "base64").toString("utf-8");
  } else if (msg.payload?.body?.data) {
    bodyText = Buffer.from(msg.payload.body.data, "base64").toString("utf-8");
  } else {
    // Fallback: use snippet
    bodyText = snippet;
  }

  return { from, to, subject, date, bodyText: bodyText.slice(0, 5000), snippet };
}

/**
 * Check if message is likely recruiter/job-related mail.
 * Heuristics: known ATS domains, keywords apply/interview/application.
 */
function isLikelyJobMail(from: string, subject: string, bodyText: string): boolean {
  const fromLower = from.toLowerCase();
  const subjectLower = subject.toLowerCase();
  const bodyLower = bodyText.toLowerCase();

  // Known ATS/recruiting domains
  const atsDomains = [
    "greenhouse.io",
    "lever.co",
    "workable.com",
    "ashbyhq.com",
    "smartrecruiters.com",
    "recruitee.com",
    "personio",
    "teamtailor",
    "bamboohr",
    "workday.com",
    "oracle.com",
    "icims.com",
    "taleo.net",
    "jobvite.com",
    "bullhorn",
    "jazz.co",
    "breezy.hr",
    "recruitcrm",
    "zoho.com/recruit",
  ];

  if (atsDomains.some((d) => fromLower.includes(d))) return true;

  // Recruiter/HR email patterns
  const recruiterPatterns = [
    "recruiting@",
    "talent@",
    "hr@",
    "careers@",
    "jobs@",
    "recruitment@",
    "hiring@",
  ];
  if (recruiterPatterns.some((p) => fromLower.includes(p))) return true;

  // Job keywords in subject or body
  const jobKeywords = [
    "application",
    "interview",
    "position",
    "candidatura",
    "colloquio",
    "candidacy",
    "apply",
    "applicant",
    "job opening",
    "opportunity",
    "thank you for applying",
    "we received your application",
    "next steps",
    "schedule a call",
    "phone screen",
  ];

  const combinedText = `${subjectLower} ${bodyLower}`;
  return jobKeywords.some((kw) => combinedText.includes(kw));
}

/**
 * Try to match Gmail message to existing Application by company name or job title.
 * Returns applicationId if match found, null otherwise.
 */
async function matchToApplication(
  userId: string,
  from: string,
  subject: string,
  bodyText: string,
): Promise<string | null> {
  // Extract company name from sender (often "Name <email@company.com>")
  const emailMatch = from.match(/<([^>]+)>/);
  const email = emailMatch ? emailMatch[1] : from;
  const domain = email.split("@")[1]?.toLowerCase() || "";

  // Fetch user's recent applications
  const applications = await prisma.application.findMany({
    where: { userId, status: "success" },
    orderBy: { completedAt: "desc" },
    take: 100,
    select: {
      id: true,
      job: { select: { company: true, title: true, url: true } },
    },
  });

  // Try to match by company name in domain or subject/body
  for (const app of applications) {
    const companyLower = (app.job.company || "").toLowerCase();
    if (!companyLower) continue;

    // Match company name in domain (e.g., "acme.com" matches "Acme Inc")
    const companySlug = companyLower.replace(/[^a-z0-9]/g, "");
    const domainSlug = domain.replace(/[^a-z0-9]/g, "");
    if (domainSlug.includes(companySlug) || companySlug.includes(domainSlug)) {
      return app.id;
    }

    // Match company name in subject or body
    const combined = `${subject} ${bodyText}`.toLowerCase();
    if (combined.includes(companyLower)) {
      return app.id;
    }
  }

  return null;
}

/**
 * Sync recent Gmail messages for a user.
 * Fetches up to maxMessages, filters for job-related mail, classifies, and stores.
 * Returns count of new messages synced.
 */
export async function syncGmailMessages(
  userId: string,
  maxMessages = 50,
): Promise<{ synced: number; skipped: number; error?: string }> {
  try {
    const accessToken = await getGmailAccessToken(userId);
    if (!accessToken) {
      return { synced: 0, skipped: 0, error: "No Gmail access token (not connected)" };
    }

    // Fetch message list
    const listResponse = await fetchGmailMessages(accessToken, maxMessages);
    if (!listResponse.messages || listResponse.messages.length === 0) {
      return { synced: 0, skipped: 0 };
    }

    let synced = 0;
    let skipped = 0;

    // Process each message
    for (const msgRef of listResponse.messages) {
      // Check if already synced
      const existing = await prisma.gmailMessage.findUnique({
        where: { userId_gmailMessageId: { userId, gmailMessageId: msgRef.id } },
      });
      if (existing) {
        skipped++;
        continue;
      }

      // Fetch full message details
      const msg = await fetchGmailMessageById(accessToken, msgRef.id);
      const parsed = parseGmailMessage(msg);

      // Filter for job-related mail
      if (!isLikelyJobMail(parsed.from, parsed.subject, parsed.bodyText)) {
        skipped++;
        continue;
      }

      // Classify message
      const classified = classifyReply({
        fromAddress: parsed.from,
        subject: parsed.subject,
        bodyText: parsed.bodyText,
      });

      // Try to match to application
      const applicationId = await matchToApplication(
        userId,
        parsed.from,
        parsed.subject,
        parsed.bodyText,
      );

      // Determine label from classification
      const labelMap: Record<string, string> = {
        colloquio: "Interview invitation",
        rifiutata: "Not this time",
        risposta: "Response",
        ricevuta: "Application Confirmation",
        auto: "Auto-reply",
        bounce: "Bounce",
      };
      const label = labelMap[classified.kind] || null;

      // Store message
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

      synced++;
    }

    return { synced, skipped };
  } catch (err) {
    console.error("[gmail] Sync error:", err);
    return { synced: 0, skipped: 0, error: String(err) };
  }
}

/**
 * Check if user has Gmail connected (Google Account with valid tokens).
 */
export async function hasGmailConnected(userId: string): Promise<boolean> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { access_token: true, refresh_token: true },
  });
  return !!(account?.access_token || account?.refresh_token);
}
