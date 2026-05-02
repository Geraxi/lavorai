import { prisma } from "@/lib/db";

/**
 * Quota email platform-wide. Resend free tier: 100/giorno, 3000/mese.
 * Lavoriamo a margine (95/2900 di default) per evitare hard-fail.
 * Override via env: RESEND_DAILY_LIMIT, RESEND_MONTHLY_LIMIT.
 *
 * Quando ci avviciniamo/superiamo il limite:
 *  - NON inviamo l'email
 *  - MA la candidatura continua il suo processing (Claude, DB, Playwright)
 *  - logghiamo il fatto
 */

const DEFAULT_DAILY = 95;
const DEFAULT_MONTHLY = 2900;

function limits(): { daily: number; monthly: number } {
  const daily = Number(process.env.RESEND_DAILY_LIMIT ?? DEFAULT_DAILY);
  const monthly = Number(process.env.RESEND_MONTHLY_LIMIT ?? DEFAULT_MONTHLY);
  return {
    daily: Number.isFinite(daily) && daily > 0 ? daily : DEFAULT_DAILY,
    monthly: Number.isFinite(monthly) && monthly > 0 ? monthly : DEFAULT_MONTHLY,
  };
}

function dayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function monthStart(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Ritorna { allowed, reason } — allowed=false se siamo oltre il limite. */
export async function canSendEmail(): Promise<{
  allowed: boolean;
  reason: string | null;
  today: number;
  month: number;
  daily: number;
  monthly: number;
}> {
  const { daily, monthly } = limits();
  const [today, month] = await Promise.all([
    prisma.emailLog.count({ where: { createdAt: { gte: dayStart() } } }),
    prisma.emailLog.count({ where: { createdAt: { gte: monthStart() } } }),
  ]);
  if (today >= daily) {
    return {
      allowed: false,
      reason: `daily limit reached (${today}/${daily})`,
      today,
      month,
      daily,
      monthly,
    };
  }
  if (month >= monthly) {
    return {
      allowed: false,
      reason: `monthly limit reached (${month}/${monthly})`,
      today,
      month,
      daily,
      monthly,
    };
  }
  return { allowed: true, reason: null, today, month, daily, monthly };
}

export type EmailKind =
  | "cv_ready"
  | "application_sent"
  | "application_manual"
  | "signup_verify"
  | "password_reset"
  | "welcome"
  | "magic_link"
  | "other";

/** Marca un'email come effettivamente consegnata per il tracking quota. */
export async function recordEmailSent(
  kind: EmailKind,
  to: string,
): Promise<void> {
  try {
    await prisma.emailLog.create({ data: { kind, to } });
  } catch (err) {
    console.warn("[email-quota] log write failed", err);
  }
}

/**
 * Helper unificato: verifica quota + invia + logga. Se bloccato ritorna
 * { sent: false, reason }. Il chiamante decide se loggare/avvisare.
 */
export async function sendWithinQuota(
  kind: EmailKind,
  to: string,
  sendFn: () => Promise<void>,
): Promise<{ sent: boolean; reason: string | null }> {
  const q = await canSendEmail();
  if (!q.allowed) {
    console.warn(
      `[email-quota] SKIP ${kind} → ${to} (${q.reason}; today=${q.today}/${q.daily} month=${q.month}/${q.monthly})`,
    );
    return { sent: false, reason: q.reason };
  }
  try {
    await sendFn();
    await recordEmailSent(kind, to);
    return { sent: true, reason: null };
  } catch (err) {
    // Non registriamo il log se il send ha fallito → non conta verso la quota
    throw err;
  }
}
