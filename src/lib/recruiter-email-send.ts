/**
 * Recruiter-email send policy: From on lavorai.it, stable attempt keys,
 * and a 30-day user+job / user+recipient duplicate fence.
 * Pure helpers stay injectable so tests never send real mail.
 */

export const DEFAULT_RECRUITER_EMAIL_FROM = "candidature@lavorai.it";
export const RECRUITER_EMAIL_ATTEMPT_PREFIX = "recruiter-email";
export const RECRUITER_EMAIL_DEDUP_MS = 30 * 24 * 60 * 60 * 1000;
export const RECRUITER_EMAIL_ACTIVE_STATUSES = ["sending", "accepted", "delivered", "delayed", "unknown"] as const;

export function recruiterFromAddress(
  fullName: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = (env.RECRUITER_EMAIL_FROM ?? DEFAULT_RECRUITER_EMAIL_FROM).trim();
  const email = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(configured)
    ? configured
    : (configured.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1] ?? DEFAULT_RECRUITER_EMAIL_FROM);
  const name = (fullName ?? "").replace(/[<>\r\n"]/g, "").replace(/\s+/g, " ").trim() || "Candidato";
  return `"${name} via LavorAI" <${email.toLowerCase()}>`;
}

export function recruiterEmailAttemptKey(applicationId: string, jobId: string, recipient: string): string {
  return `${RECRUITER_EMAIL_ATTEMPT_PREFIX}:${applicationId}:${jobId}:${recipient.trim().toLowerCase()}`;
}

export function isRecruiterEmailAttemptKey(attemptKey: string, applicationId: string): boolean {
  return attemptKey.startsWith(`${RECRUITER_EMAIL_ATTEMPT_PREFIX}:${applicationId}:`);
}

/** Proof lookup accepts the stable per-recipient key and the pre-fix timestamp key. */
export function matchesApplicationEmailProofKey(
  attemptKey: string,
  applicationId: string,
  workToken: Date,
): boolean {
  return attemptKey === `application-${applicationId}-${workToken.getTime()}`
    || isRecruiterEmailAttemptKey(attemptKey, applicationId);
}

export function isActiveRecruiterEmailStatus(status: string | null | undefined): boolean {
  return !!status && (RECRUITER_EMAIL_ACTIVE_STATUSES as readonly string[]).includes(status);
}

export type RecruiterEmailAttemptRow = {
  applicationId: string;
  userId: string;
  jobId: string;
  recipient: string;
  status: string;
  createdAt: Date;
  acceptedAt?: Date | null;
  providerEmailId?: string | null;
};

/** Same user+job or same user+recipient, successful or still pending, inside 30 days. */
export function recentRecruiterEmailDuplicate(
  rows: RecruiterEmailAttemptRow[],
  query: { userId: string; jobId: string; recipient: string; now?: Date; windowMs?: number },
): RecruiterEmailAttemptRow | null {
  const now = query.now ?? new Date();
  const windowMs = query.windowMs ?? RECRUITER_EMAIL_DEDUP_MS;
  const recipient = query.recipient.trim().toLowerCase();
  const since = +now - windowMs;
  return rows.find((row) => {
    if (row.userId !== query.userId) return false;
    if (+row.createdAt < since && +(row.acceptedAt ?? 0) < since) return false;
    if (!isActiveRecruiterEmailStatus(row.status) && !row.acceptedAt && !row.providerEmailId) return false;
    return row.jobId === query.jobId || row.recipient.trim().toLowerCase() === recipient;
  }) ?? null;
}

export async function findRecentRecruiterEmailDuplicate(opts: {
  userId: string;
  jobId: string;
  recipient: string;
  now?: Date;
  find: () => Promise<RecruiterEmailAttemptRow[]>;
}): Promise<RecruiterEmailAttemptRow | null> {
  return recentRecruiterEmailDuplicate(await opts.find(), opts);
}
