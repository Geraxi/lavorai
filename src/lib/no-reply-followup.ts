import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { sendWithinQuota } from "@/lib/email-quota";
import { isTestAccount } from "@/lib/admin";

/**
 * Follow-up "abbiamo mandato, azienda ancora silente".
 *
 * Alcuni ATS non mandano auto-reply di ricezione. Se dopo N giorni 
 * l'azienda non ha risposto ai canali inbound (lastReplyAt still null) 
 * rassicuriamo l'utente con un'email onesta: candidatura consegnata, 
 * ancora in attesa di risposta (NON forgiamo fake rejection).
 *
 * Vincoli:
 *  - Solo application status=success
 *  - submittedAt >= FOLLOWUP_MIN_DAYS giorni fa (timestamp REALE)
 *  - lastReplyAt == null (azienda non ha risposto)
 *  - Esclude test/interni
 */

const FOLLOWUP_MIN_DAYS = 3;
const FOLLOWUP_MAX_DAYS = 21;
const FOLLOWUPS_PER_USER_PER_RUN = 2;
const DEFAULT_BATCH_CAP = 30;

export interface NoReplyRunResult {
  found: number;
  sent: number;
  failed: number;
  details: Array<{ email: string; applicationId: string; status: string }>;
}

/**
 * Draft follow-up email templates per candidature ghosted.
 * 
 * L'UTENTE decide se mandare (via mailto: link o copia-incolla).
 * MAI auto-inviamo a nome dell'utente — sarebbe disonesto impersonare
 * l'utente in una comunicazione follow-up che potrebbe danneggiare.
 */

export interface FollowUpDraft {
  subject: string;
  body: string;
  toAddress: string | null;
  jobTitle: string;
  company: string | null;
}

export function generateFollowUpDraft(data: {
  userFirstName: string;
  jobTitle: string;
  company: string | null;
  recruiterEmail: string | null;
  submittedAt: Date;
  daysSince: number;
  lang?: "it" | "en";
}): FollowUpDraft {
  const lang = data.lang ?? "it";
  const isIT = lang === "it";
  
  const company = data.company ?? (isIT ? "la vostra azienda" : "your company");
  const daysText = isIT
    ? data.daysSince === 7 ? "una settimana" : `${data.daysSince} giorni`
    : data.daysSince === 7 ? "a week" : `${data.daysSince} days`;

  const subject = isIT
    ? `Sollecito candidatura — ${data.jobTitle}`
    : `Follow-up on application — ${data.jobTitle}`;

  const body = isIT
    ? `Gentile team di ${company},\n\n` +
      `Vi avevo inviato la mia candidatura per la posizione di ${data.jobTitle} circa ${daysText} fa.\n\n` +
      `Sono ancora molto interessato/a a questa opportunità e vorrei sapere se avete avuto modo di ` +
      `esaminare il mio profilo. Sono disponibile per un colloquio conoscitivo nei prossimi giorni.\n\n` +
      `Resto in attesa di un vostro riscontro.\n\n` +
      `Cordiali saluti,\n${data.userFirstName}`
    : `Dear ${company} team,\n\n` +
      `I submitted my application for the ${data.jobTitle} position about ${daysText} ago.\n\n` +
      `I remain very interested in this opportunity and would like to know if you have had a chance ` +
      `to review my profile. I am available for an interview in the coming days.\n\n` +
      `Looking forward to hearing from you.\n\n` +
      `Best regards,\n${data.userFirstName}`;

  return {
    subject,
    body,
    toAddress: data.recruiterEmail,
    jobTitle: data.jobTitle,
    company: data.company,
  };
}

export function getMailtoLink(draft: FollowUpDraft): string {
  if (!draft.toAddress) return "";
  const params = new URLSearchParams({
    subject: draft.subject,
    body: draft.body,
  });
  return `mailto:${encodeURIComponent(draft.toAddress)}?${params.toString()}`;
}

/**
 * Cron function: notifica utenti con candidature "sent" ma ghosted
 * (nessuna risposta dopo N giorni). ONESTO: diciamo "ancora in attesa",
 * MAI forgiamo fake rejection email.
 */
export async function runNoReplyFollowups(opts?: {
  dryRun?: boolean;
  cap?: number;
}): Promise<NoReplyRunResult> {
  const now = Date.now();
  const minAge = new Date(now - FOLLOWUP_MIN_DAYS * 86_400_000);
  const maxAge = new Date(now - FOLLOWUP_MAX_DAYS * 86_400_000);
  const cap = opts?.cap ?? DEFAULT_BATCH_CAP;

  // Usa submittedAt (timestamp REALE) invece di completedAt
  const apps = await prisma.application.findMany({
    where: {
      status: "success",
      submittedAt: { lte: minAge, gte: maxAge },
      lastReplyAt: null,
      // Non rinotificare chi ha già ricevuto questo tipo di email
      NOT: {
        user: {
          emailLogs: {
            some: {
              kind: "no_reply_followup",
              createdAt: { gte: new Date(now - 7 * 86_400_000) },
            },
          },
        },
      },
    },
    include: {
      job: { select: { title: true, company: true } },
      user: { select: { id: true, email: true, name: true, locale: true } },
    },
    take: cap,
    orderBy: { submittedAt: "asc" },
  });

  const result: NoReplyRunResult = {
    found: apps.length,
    sent: 0,
    failed: 0,
    details: [],
  };

  // Raggruppa per utente: max FOLLOWUPS_PER_USER_PER_RUN per utente
  const byUser = new Map<string, typeof apps>();
  for (const app of apps) {
    if (isTestAccount(app.user.email)) continue;
    const list = byUser.get(app.user.id) ?? [];
    if (list.length < FOLLOWUPS_PER_USER_PER_RUN) {
      list.push(app);
      byUser.set(app.user.id, list);
    }
  }

  for (const [userId, userApps] of byUser) {
    for (const app of userApps) {
      if (opts?.dryRun) {
        result.details.push({
          email: app.user.email,
          applicationId: app.id,
          status: "dry_run",
        });
        result.sent++;
        continue;
      }

      try {
        await sendNoReplyFollowupEmail({
          userEmail: app.user.email,
          userName: app.user.name,
          userLocale: app.user.locale,
          jobTitle: app.job.title,
          company: app.job.company,
          submittedAt: app.submittedAt!,
        });

        result.sent++;
        result.details.push({
          email: app.user.email,
          applicationId: app.id,
          status: "sent",
        });
      } catch (err) {
        result.failed++;
        result.details.push({
          email: app.user.email,
          applicationId: app.id,
          status: `failed: ${err instanceof Error ? err.message : "unknown"}`,
        });
      }
    }
  }

  return result;
}

/**
 * Invia email onesta "ancora in attesa di risposta" (NO fake rejection).
 */
async function sendNoReplyFollowupEmail(data: {
  userEmail: string;
  userName: string | null;
  userLocale: string | null;
  jobTitle: string;
  company: string | null;
  submittedAt: Date;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[no-reply-followup DEV] Would send to ${data.userEmail}`);
      return;
    }
    throw new Error("RESEND_API_KEY missing");
  }

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM ?? "LavorAI <onboarding@resend.dev>";
  const firstName = (data.userName ?? "").split(/\s+/)[0] || "";
  const company = data.company ?? "l'azienda";
  const daysSince = Math.floor(
    (Date.now() - data.submittedAt.getTime()) / 86_400_000
  );

  const locale = data.userLocale === "en" ? "en" : "it";
  const isIT = locale === "it";

  const subject = isIT
    ? `In attesa di risposta per "${data.jobTitle}"`
    : `Waiting for reply on "${data.jobTitle}"`;

  const text = isIT
    ? `Ciao ${firstName},\n\n` +
      `Abbiamo inviato la tua candidatura per "${data.jobTitle}" ` +
      `presso ${company} circa ${daysSince} giorni fa.\n\n` +
      `Molti ATS non inviano conferme automatiche. È normale — ` +
      `non significa rifiuto. Alcuni recruiter rispondono dopo settimane.\n\n` +
      `Ti avviseremo appena riceviamo una risposta.\n\n` +
      `— LavorAI`
    : `Hi ${firstName},\n\n` +
      `We submitted your application for "${data.jobTitle}" ` +
      `at ${company} about ${daysSince} days ago.\n\n` +
      `Many ATS don't send automatic confirmations. This is normal — ` +
      `it doesn't mean rejection. Some recruiters reply after weeks.\n\n` +
      `We'll notify you as soon as we receive a response.\n\n` +
      `— LavorAI`;

  await sendWithinQuota("no_reply_followup", data.userEmail, async () => {
    await resend.emails.send({
      from,
      to: data.userEmail,
      subject,
      text,
      html: renderNoReplyEmail({
        firstName,
        jobTitle: data.jobTitle,
        company,
        daysSince,
        locale,
      }),
    });
  });
}

function renderNoReplyEmail(data: {
  firstName: string;
  jobTitle: string;
  company: string;
  daysSince: number;
  locale: "it" | "en";
}): string {
  const isIT = data.locale === "it";
  const m = isIT
    ? {
        title: `In attesa di risposta${data.firstName ? `, ${data.firstName}` : ""}`,
        intro: `Abbiamo inviato la tua candidatura per <strong>${escapeHtml(data.jobTitle)}</strong> presso ${escapeHtml(data.company)} circa ${data.daysSince} giorni fa.`,
        explanation:
          "Molti ATS non inviano conferme automatiche. <strong>È normale</strong> — non significa rifiuto. Alcuni recruiter rispondono dopo settimane.",
        action:
          "Ti avviseremo appena riceviamo una risposta. Nel frattempo puoi monitorare lo stato dalla tua dashboard.",
        dashboardHint: "Vedi tutte le candidature su lavorai.it/applications",
      }
    : {
        title: `Waiting for reply${data.firstName ? `, ${data.firstName}` : ""}`,
        intro: `We submitted your application for <strong>${escapeHtml(data.jobTitle)}</strong> at ${escapeHtml(data.company)} about ${data.daysSince} days ago.`,
        explanation:
          "Many ATS don't send automatic confirmations. <strong>This is normal</strong> — it doesn't mean rejection. Some recruiters reply after weeks.",
        action:
          "We'll notify you as soon as we receive a response. Meanwhile you can track the status from your dashboard.",
        dashboardHint: "See all applications at lavorai.it/applications",
      };

  return `<!doctype html>
<html lang="${data.locale}"><body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;color:#0F1012;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="font-size:18px;font-weight:700;margin-bottom:32px;">
      LavorAI
    </div>
    <h1 style="font-size:22px;font-weight:600;margin:0 0 8px;">${m.title}</h1>
    <p style="font-size:15px;line-height:1.55;color:#5B5D61;margin:0 0 20px;">
      ${m.intro}
    </p>
    <div style="padding:16px 18px;border:1px solid #E6E4DD;border-radius:8px;margin-bottom:20px;background:#FFFEF8;">
      <p style="font-size:14px;line-height:1.55;color:#0F1012;margin:0;">
        ${m.explanation}
      </p>
    </div>
    <p style="font-size:14px;line-height:1.55;color:#5B5D61;margin:0 0 20px;">
      ${m.action}
    </p>
    <a href="https://lavorai.it/applications" style="display:inline-block;background:#0F1012;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:500;font-size:14px;">Vai alla dashboard →</a>
    <hr style="border:none;border-top:1px solid #E6E4DD;margin:32px 0 16px;"/>
    <p style="font-size:11px;color:#8A8C90;line-height:1.5;margin:0;">
      ${m.dashboardHint}
    </p>
  </div>
</body></html>`;
}

function escapeHtml(s: string | null): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
