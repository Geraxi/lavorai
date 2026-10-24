import { prisma } from "@/lib/db";

/**
 * Per-recipient-domain daily cap for recruiter application emails.
 * Platform Resend quotas stay in email-quota.ts; this only slows bursts
 * toward one employer's mailboxes (hr@acme.com + jobs@acme.com share a bucket).
 *
 * Optional env: RECIPIENT_DOMAIN_DAILY_LIMIT (default 12). Not required in prod.
 */

export const DEFAULT_RECIPIENT_DOMAIN_DAILY_LIMIT = 12;

export function recipientDomainDailyLimit(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.RECIPIENT_DOMAIN_DAILY_LIMIT ?? DEFAULT_RECIPIENT_DOMAIN_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_RECIPIENT_DOMAIN_DAILY_LIMIT;
}

export function recipientDomainOf(address: string): string | null {
  const domain = address.trim().toLowerCase().split("@")[1] ?? "";
  return domain.includes(".") ? domain : null;
}

function dayStart(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function canSendToRecipientDomain(
  recipient: string,
  opts: {
    now?: Date;
    limit?: number;
    countToday?: (domain: string, since: Date) => Promise<number>;
  } = {},
): Promise<{ allowed: boolean; reason: string | null; domain: string | null; used: number; limit: number }> {
  const domain = recipientDomainOf(recipient);
  const limit = opts.limit ?? recipientDomainDailyLimit();
  if (!domain) return { allowed: false, reason: "invalid_recipient_domain", domain: null, used: 0, limit };
  const since = dayStart(opts.now);
  const used = opts.countToday
    ? await opts.countToday(domain, since)
    : await prisma.applicationEmailAttempt.count({
      where: {
        recipient: { endsWith: `@${domain}` },
        acceptedAt: { gte: since },
        status: { notIn: ["failed", "bounced"] },
      },
    });
  if (used >= limit) {
    return { allowed: false, reason: `recipient_domain_daily_limit (${used}/${limit})`, domain, used, limit };
  }
  return { allowed: true, reason: null, domain, used, limit };
}
