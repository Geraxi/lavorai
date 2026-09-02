import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { sendWithinQuota } from "@/lib/email-quota";
import { isTestAccount } from "@/lib/admin";

/**
 * Daily activity summary — LavorAI dice all'utente cosa ha fatto per lui
 * nelle ultime 24h. Copre il gap "auto mode + 0 success" dove oggi
 * l'utente non riceveva NIENTE anche se il motore aveva processato N
 * candidature (perché in auto mode l'email per RTA è silenziata).
 *
 * Copy ONESTA: distingue "inviate" (success, con o senza conferma) da
 * "preparate" (ready_to_apply, servono submit manuale). Non finge.
 *
 * Cooldown: 1 email/utente/24h.
 * Requisito: almeno 1 candidatura processata nelle 24h.
 */

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface DailySummaryResult {
  sent: number;
  skipped: number;
  errors: number;
  details: Array<{ email: string; status: string; counts?: string }>;
}

interface UserActivity {
  /** DETECTED_* : submit ATS con prova hard (2xx / DOM di conferma) */
  atsConfirmedCount: number;
  /** EMAIL_SENT : email consegnata al recruiter (SMTP 250 OK, no conferma lettura) */
  emailSentCount: number;
  /** Somma dei due sopra — usata dove non serve distinguere */
  successCount: number;
  rtaCount: number;
  failedCount: number;
  atsConfirmedJobs: Array<{ title: string; company: string | null; url: string }>;
  emailSentJobs: Array<{ title: string; company: string | null; url: string }>;
  rtaJobs: Array<{ title: string; company: string | null; url: string }>;
}

export async function runDailySummary(opts?: {
  onlyEmail?: string;
  dryRun?: boolean;
}): Promise<DailySummaryResult> {
  const now = Date.now();
  const since = new Date(now - COOLDOWN_MS);

  // Utenti con almeno 1 candidatura processata nelle ultime 24h
  // (raggruppate per user)
  const active = await prisma.application.groupBy({
    by: ["userId"],
    where: {
      completedAt: { gte: since },
      status: { in: ["success", "ready_to_apply", "failed"] },
      ...(opts?.onlyEmail
        ? { user: { email: opts.onlyEmail } }
        : {}),
    },
    _count: { _all: true },
  });

  const details: DailySummaryResult["details"] = [];
  let sent = 0,
    skipped = 0,
    errors = 0;
  const apiKey = process.env.RESEND_API_KEY;

  for (const g of active) {
    const user = await prisma.user.findUnique({
      where: { id: g.userId },
      select: { id: true, email: true, name: true, locale: true, tier: true },
    });
    if (!user) {
      details.push({ email: "?", status: "user_not_found" });
      skipped++;
      continue;
    }
    if (isTestAccount(user.email)) {
      details.push({ email: user.email, status: "test_skip" });
      skipped++;
      continue;
    }

    // Cooldown: se già inviato daily_summary nelle 24h → skip
    const recent = await prisma.emailLog.count({
      where: {
        kind: "daily_summary",
        to: user.email,
        createdAt: { gte: since },
      },
    });
    if (recent > 0) {
      details.push({ email: user.email, status: "cooldown" });
      skipped++;
      continue;
    }

    // Raccogli l'attività
    const apps = await prisma.application.findMany({
      where: {
        userId: user.id,
        completedAt: { gte: since },
        status: { in: ["success", "ready_to_apply", "failed"] },
      },
      select: {
        status: true,
        submitConfirmation: true,
        submittedVia: true,
        job: { select: { title: true, company: true, url: true } },
      },
      orderBy: { completedAt: "desc" },
    });

    const successApps = apps.filter((a) => a.status === "success");
    const atsApps = successApps.filter(
      (a) => (a.submitConfirmation ?? "").startsWith("DETECTED"),
    );
    const emailApps = successApps.filter(
      (a) => a.submitConfirmation === "EMAIL_SENT" || a.submittedVia === "email_recruiter",
    );

    const mapJob = (a: (typeof apps)[number]) => ({
      title: a.job?.title ?? "?",
      company: a.job?.company ?? null,
      url: a.job?.url ?? "#",
    });

    const activity: UserActivity = {
      atsConfirmedCount: atsApps.length,
      emailSentCount: emailApps.length,
      successCount: successApps.length,
      rtaCount: apps.filter((a) => a.status === "ready_to_apply").length,
      failedCount: apps.filter((a) => a.status === "failed").length,
      atsConfirmedJobs: atsApps.slice(0, 8).map(mapJob),
      emailSentJobs: emailApps.slice(0, 8).map(mapJob),
      rtaJobs: apps
        .filter((a) => a.status === "ready_to_apply")
        .slice(0, 8)
        .map(mapJob),
    };

    const total = activity.successCount + activity.rtaCount + activity.failedCount;
    if (total === 0) {
      details.push({ email: user.email, status: "no_activity" });
      skipped++;
      continue;
    }

    const counts = `${activity.successCount}s+${activity.rtaCount}r+${activity.failedCount}f`;

    if (opts?.dryRun) {
      details.push({ email: user.email, status: "dry_run", counts });
      continue;
    }
    if (!apiKey) {
      details.push({ email: user.email, status: "no_resend_key", counts });
      skipped++;
      continue;
    }

    try {
      const { subject, html, text } = renderSummary(user, activity);
      await sendWithinQuota("daily_summary", user.email, async () => {
        const resend = new Resend(apiKey);
        const from = process.env.EMAIL_FROM ?? "LavorAI <onboarding@resend.dev>";
        await resend.emails.send({ from, to: user.email, subject, html, text });
      });
      details.push({ email: user.email, status: "sent", counts });
      sent++;
    } catch (err) {
      details.push({
        email: user.email,
        status: "error: " + (err instanceof Error ? err.message.slice(0, 80) : "?"),
      });
      errors++;
    }
  }

  return { sent, skipped, errors, details };
}

// ---------- Email content ----------

function renderSummary(
  user: { email: string; name: string | null; locale: string | null },
  a: UserActivity,
): { subject: string; html: string; text: string } {
  const en = user.locale === "en";
  const first = user.name?.trim().split(/\s+/)[0] ?? null;
  const greet = first ? (en ? `Hi ${first},` : `Ciao ${first},`) : en ? "Hi," : "Ciao,";
  const total = a.successCount + a.rtaCount + a.failedCount;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";

  const subject = en
    ? `Today: ${total} applications processed for you`
    : `Oggi: ${total} candidature processate per te`;

  const introHtml = en
    ? `<p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 16px;">Here's what LavorAI did for you in the last 24 hours:</p>`
    : `<p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 16px;">Ecco cosa ha fatto LavorAI per te nelle ultime 24 ore:</p>`;

  const summaryBoxHtml = `<div style="padding:14px 16px;background:#F1F5F9;border-radius:8px;margin-bottom:20px;font-size:14px;line-height:1.7;color:#0F172A;">
    ${a.atsConfirmedCount > 0 ? `<div><strong style="color:#16A34A;">✓ ${a.atsConfirmedCount}</strong> ${en ? "delivered to ATS with confirmation" : "consegnate su portale ATS con conferma"}</div>` : ""}
    ${a.emailSentCount > 0 ? `<div><strong style="color:#3B82F6;">✉ ${a.emailSentCount}</strong> ${en ? "sent to recruiter by email (no delivery confirmation from their side)" : "inviate al recruiter via email (nessuna conferma di lettura dalla loro parte)"}</div>` : ""}
    <div><strong style="color:#EAB308;">◐ ${a.rtaCount}</strong> ${en ? "prepared — need your 1-click approval" : "preparate — servono ancora la tua approvazione (1-click)"}</div>
    ${a.failedCount > 0 ? `<div><strong style="color:#94A3B8;">✕ ${a.failedCount}</strong> ${en ? "failed (auto-retry)" : "fallite (retry automatico)"}</div>` : ""}
  </div>`;

  const listBlock = (title: string, jobs: UserActivity["atsConfirmedJobs"]) => {
    if (jobs.length === 0) return "";
    const items = jobs
      .map(
        (j) =>
          `<li style="margin:6px 0;font-size:13.5px;line-height:1.5;"><a href="${escapeHtml(j.url)}" style="color:#0F172A;text-decoration:none;"><strong>${escapeHtml(j.title)}</strong>${j.company ? ` · <span style="color:#64748B;">${escapeHtml(j.company)}</span>` : ""}</a></li>`,
      )
      .join("");
    return `<div style="margin-bottom:16px;"><div style="font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">${title}</div><ul style="margin:0;padding:0 0 0 18px;">${items}</ul></div>`;
  };

  const rtaBlock = a.rtaJobs.length
    ? listBlock(en ? "Ready for your approval" : "Pronte per la tua approvazione", a.rtaJobs)
    : "";
  const atsBlock = a.atsConfirmedJobs.length
    ? listBlock(en ? "Delivered to ATS (confirmed)" : "Consegnate su ATS (con conferma)", a.atsConfirmedJobs)
    : "";
  const emailBlock = a.emailSentJobs.length
    ? listBlock(en ? "Sent by email to recruiter" : "Inviate al recruiter via email", a.emailSentJobs)
    : "";

  const ctaText = en ? "Review & approve on your dashboard" : "Rivedile e approva dal dashboard";
  const ctaUrl = `${siteUrl}/applications`;

  const footer = en
    ? "You get this daily summary because you have auto-apply on. Manage in Settings."
    : "Ricevi questo report giornaliero perché hai l'auto-apply attivo. Gestisci nelle Impostazioni.";

  const html = `<!doctype html><html lang="${en ? "en" : "it"}"><body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#0F172A;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
    <div style="font-size:22px;font-weight:700;letter-spacing:-0.01em;margin-bottom:24px;">Lavor<span style="color:#16A34A;">AI</span></div>
    <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 8px;">${greet}</p>
    ${introHtml}
    ${summaryBoxHtml}
    ${atsBlock}
    ${emailBlock}
    ${rtaBlock}
    ${a.rtaCount > 0 ? `<div style="text-align:center;margin:24px 0;"><a href="${ctaUrl}" style="display:inline-block;background:#16A34A;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">${ctaText} →</a></div>` : ""}
    <hr style="border:none;border-top:1px solid #E2E8F0;margin:28px 0 16px;" />
    <p style="font-size:11.5px;color:#94A3B8;line-height:1.6;margin:0;">${footer}<br/>© 2026 LavorAI</p>
  </div>
</body></html>`;

  const textLines = [
    greet,
    "",
    en
      ? `Today LavorAI processed ${total} applications for you:`
      : `Oggi LavorAI ha processato ${total} candidature per te:`,
    en ? `- ${a.atsConfirmedCount} delivered to ATS (confirmed)` : `- ${a.atsConfirmedCount} consegnate su ATS (con conferma)`,
    en ? `- ${a.emailSentCount} sent to recruiter by email` : `- ${a.emailSentCount} inviate al recruiter via email`,
    en
      ? `- ${a.rtaCount} prepared, awaiting your 1-click approval`
      : `- ${a.rtaCount} preparate, in attesa della tua approvazione (1-click)`,
    ...(a.failedCount > 0
      ? [en ? `- ${a.failedCount} failed (auto-retry)` : `- ${a.failedCount} fallite (retry automatico)`]
      : []),
    "",
    ...(a.rtaJobs.length > 0
      ? [
          en ? "Ready for your approval:" : "Pronte per la tua approvazione:",
          ...a.rtaJobs.map((j) => `  - ${j.title}${j.company ? ` @ ${j.company}` : ""} — ${j.url}`),
          "",
        ]
      : []),
    ...(a.atsConfirmedJobs.length > 0
      ? [
          en ? "Delivered to ATS (confirmed):" : "Consegnate su ATS (con conferma):",
          ...a.atsConfirmedJobs.map((j) => `  - ${j.title}${j.company ? ` @ ${j.company}` : ""}`),
          "",
        ]
      : []),
    ...(a.emailSentJobs.length > 0
      ? [
          en ? "Sent to recruiter by email:" : "Inviate al recruiter via email:",
          ...a.emailSentJobs.map((j) => `  - ${j.title}${j.company ? ` @ ${j.company}` : ""}`),
          "",
        ]
      : []),
    ctaUrl,
    "",
    "— LavorAI",
  ];

  return { subject, html, text: textLines.join("\n") };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
