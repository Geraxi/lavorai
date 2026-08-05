import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { sendWithinQuota } from "@/lib/email-quota";
import { isTestAccount } from "@/lib/admin";

/**
 * Follow-up "abbiamo mandato, azienda ancora silente".
 *
 * Alcuni ATS (specie Adzuna via email fallback) non mandano auto-reply
 * di ricezione. Se dopo N giorni l'azienda non ha risposto ai canali
 * inbound (lastReplyAt still null) rassicuriamo l'utente con un'email
 * onesta: candidatura consegnata, ancora in attesa di risposta.
 *
 * Vincoli:
 *  - Solo application status=success
 *  - completedAt >= FOLLOWUP_MIN_DAYS giorni fa
 *  - lastReplyAt == null (azienda non ha risposto)
 *  - userStatus != "no_reply_notified" (mai già notificato per questa app)
 *  - Max FOLLOWUPS_PER_USER_PER_RUN per utente per run (anti-flooding)
 *  - Esclude test/interni
 */

const FOLLOWUP_MIN_DAYS = 3;
const FOLLOWUP_MAX_DAYS = 21; // oltre non ha più senso: la candidatura è "vecchia"
const FOLLOWUPS_PER_USER_PER_RUN = 2;
const DEFAULT_BATCH_CAP = 30;

export interface NoReplyRunResult {
  found: number;
  sent: number;
  failed: number;
  details: Array<{ email: string; applicationId: string; status: string }>;
}

export async function runNoReplyFollowups(opts?: {
  dryRun?: boolean;
  cap?: number;
}): Promise<NoReplyRunResult> {
  const now = Date.now();
  const minAge = new Date(now - FOLLOWUP_MIN_DAYS * 86_400_000);
  const maxAge = new Date(now - FOLLOWUP_MAX_DAYS * 86_400_000);
  const cap = opts?.cap ?? DEFAULT_BATCH_CAP;

  const apps = await prisma.application.findMany({
    where: {
      status: "success",
      lastReplyAt: null,
      completedAt: { lte: minAge, gte: maxAge },
      OR: [{ userStatus: null }, { userStatus: { not: "no_reply_notified" } }],
    },
    select: {
      id: true,
      completedAt: true,
      submittedVia: true,
      user: {
        select: { email: true, name: true, locale: true },
      },
      job: {
        select: { title: true, company: true, url: true },
      },
    },
    orderBy: { completedAt: "asc" },
    take: cap * 2, // margine per lo skip test/interni
  });

  const sentPerUser = new Map<string, number>();
  const results: NoReplyRunResult["details"] = [];
  let sent = 0;
  let failed = 0;
  const apiKey = process.env.RESEND_API_KEY;

  for (const app of apps) {
    if (sent + failed >= cap) break;
    if (!app.user?.email) continue;
    if (isTestAccount(app.user.email)) continue;
    const count = sentPerUser.get(app.user.email) ?? 0;
    if (count >= FOLLOWUPS_PER_USER_PER_RUN) continue;

    if (opts?.dryRun) {
      results.push({ email: app.user.email, applicationId: app.id, status: "dry_run" });
      sentPerUser.set(app.user.email, count + 1);
      continue;
    }

    if (!apiKey) {
      results.push({ email: app.user.email, applicationId: app.id, status: "no_resend_key" });
      failed++;
      continue;
    }

    const { subject, html, text } = renderNoReply(app);
    try {
      await sendWithinQuota("application_no_reply_yet", app.user.email, async () => {
        const resend = new Resend(apiKey);
        const from = process.env.EMAIL_FROM ?? "LavorAI <onboarding@resend.dev>";
        await resend.emails.send({
          from,
          to: app.user.email,
          subject,
          html,
          text,
        });
      });
      // dedup: non ri-inviare per questa stessa application
      await prisma.application.update({
        where: { id: app.id },
        data: { userStatus: "no_reply_notified" },
      });
      results.push({ email: app.user.email, applicationId: app.id, status: "sent" });
      sent++;
      sentPerUser.set(app.user.email, count + 1);
    } catch (err) {
      results.push({
        email: app.user.email,
        applicationId: app.id,
        status: "error: " + (err instanceof Error ? err.message.slice(0, 80) : "?"),
      });
      failed++;
    }
  }

  return { found: apps.length, sent, failed, details: results };
}

// ---------- Email content ----------
function renderNoReply(app: {
  completedAt: Date | null;
  submittedVia: string | null;
  user: { email: string; name: string | null; locale: string | null } | null;
  job: { title: string | null; company: string | null; url: string | null } | null;
}): { subject: string; html: string; text: string } {
  const loc = app.user?.locale === "en" ? "en" : "it";
  const en = loc === "en";
  const firstName =
    app.user?.name && app.user.name.trim() ? app.user.name.split(/\s+/)[0] : null;
  const company = app.job?.company ?? (en ? "the company" : "l'azienda");
  const jobTitle = app.job?.title ?? "";
  const jobUrl = app.job?.url ?? "";
  const daysAgo = app.completedAt
    ? Math.max(3, Math.round((Date.now() - app.completedAt.getTime()) / 86_400_000))
    : 3;
  const wasEmail = app.submittedVia === "email_recruiter";

  const subject = en
    ? `Update: still waiting on ${company}`
    : `Aggiornamento: ${company} non ha ancora risposto`;

  const greet = firstName ? (en ? `Hi ${firstName},` : `Ciao ${firstName},`) : en ? "Hi," : "Ciao,";

  const body = en
    ? `${greet}\n\nQuick heads-up: we submitted your application for "${jobTitle}" to ${company} ${daysAgo} days ago, and we haven't received any reply from them yet.\n\nWhat this means:\n- The application WAS delivered${wasEmail ? " (via email to their recruiter address)" : " (through their ATS portal)"}.\n- Many companies take 1-3 weeks to respond, so silence in the first days is normal.\n- We are actively watching for their reply and will notify you as soon as it arrives.\n\nJob link: ${jobUrl}\n\n— LavorAI`
    : `${greet}\n\nUn aggiornamento: abbiamo inviato la tua candidatura per "${jobTitle}" a ${company} ${daysAgo} giorni fa, e non abbiamo ancora ricevuto risposta da loro.\n\nCosa significa:\n- La candidatura È stata consegnata${wasEmail ? " (via email al loro indirizzo di recruiting)" : " (attraverso il portale ATS)"}.\n- Molte aziende impiegano 1-3 settimane per rispondere, quindi il silenzio nei primi giorni è normale.\n- Stiamo monitorando la loro risposta e ti avviseremo appena arriva.\n\nLink annuncio: ${jobUrl}\n\n— LavorAI`;

  const html = `<!doctype html><html lang="${loc}"><body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#0F172A;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-size:22px;font-weight:700;letter-spacing:-0.01em;margin-bottom:24px;">Lavor<span style="color:#16A34A;">AI</span></div>
    <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 8px;">${greet}</p>
    <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 16px;">${en ? `Quick update on your application to <strong>${escapeHtml(company)}</strong> for <strong>${escapeHtml(jobTitle)}</strong>: we sent it <strong>${daysAgo} days ago</strong>, no reply from them yet.` : `Aggiornamento veloce sulla tua candidatura a <strong>${escapeHtml(company)}</strong> per <strong>${escapeHtml(jobTitle)}</strong>: l'abbiamo inviata <strong>${daysAgo} giorni fa</strong>, ancora nessuna risposta da loro.`}</p>
    <div style="padding:14px 16px;border-left:3px solid #16A34A;background:#ECFDF5;border-radius:6px;font-size:13.5px;line-height:1.55;color:#065F46;margin-bottom:24px;">
      ${en ? `The application <strong>was delivered</strong>${wasEmail ? " (via email to their recruiter address)" : " (through their ATS portal)"}. Many companies take 1-3 weeks to respond — silence in the first days is normal. We'll notify you the moment they reply.` : `La candidatura <strong>è stata consegnata</strong>${wasEmail ? " (via email al loro indirizzo di recruiting)" : " (attraverso il portale ATS)"}. Molte aziende impiegano 1-3 settimane per rispondere — il silenzio nei primi giorni è normale. Ti avviseremo appena rispondono.`}
    </div>
    <div style="text-align:center;margin:20px 0;">
      <a href="${jobUrl}" style="display:inline-block;background:#0F172A;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:500;font-size:14px;">${en ? "View job" : "Vedi annuncio"} →</a>
    </div>
    <hr style="border:none;border-top:1px solid #E2E8F0;margin:28px 0 16px;" />
    <p style="font-size:11.5px;color:#94A3B8;line-height:1.6;margin:0;">${en ? "You're getting this because auto-apply is active. Manage notifications in Settings." : "Ricevi questa email perché l'auto-apply è attivo. Gestisci le notifiche nelle Impostazioni."}<br/>© 2026 LavorAI</p>
  </div>
</body></html>`;

  return { subject, html, text: body };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
