import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { EMAIL_LOG_SUCCESS_WHERE, sendWithinQuota } from "@/lib/email-quota";
import { isTestAccount } from "@/lib/admin";
import { deliveryEvidence, type DeliveryEvidenceInput } from "@/lib/application-evidence";
import { redactEmailAddress, scrubResendSecretText } from "@/lib/resend-keys";

/** Report observed application states; neither legacy labels nor API acceptance
 * prove employer delivery. One notification per user per 24 hours. */
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
export interface DailySummaryResult {
  /** Notification accepted by our email provider; not a delivery/read receipt. */
  sent: number;
  skipped: number;
  errors: number;
  details: Array<{ email: string; status: string; counts?: string }>;
}
type SummaryKind = "portal" | "delivered" | "accepted" | "no_bounce" | "unknown" | "pending" | "problems" | "unverified" | "prepared";
interface Job { title: string; company: string | null; url: string }
type UserActivity = Record<SummaryKind, { count: number; jobs: Job[] }>;
const KINDS: SummaryKind[] = ["portal", "delivered", "accepted", "no_bounce", "unknown", "pending", "problems", "unverified", "prepared"];
function summaryKind(application: DeliveryEvidenceInput): SummaryKind | null {
  if (application.submittedVia === "mock_demo" || application.submitConfirmation === "DRY_RUN") return null;
  const evidence = deliveryEvidence(application);
  switch (evidence) {
    case "confirmed_portal": return "portal";
    case "confirmed_email": return "portal";
    case "provider_delivered": return "delivered";
    case "provider_accepted": return "accepted";
    case "sent_no_bounce": return "no_bounce";
    case "outcome_unknown": return "unknown";
    case "delivery_problem": return "problems";
    case "legacy_unverified": return "unverified";
    case "pending": return "pending";
    case "excluded":
      if (application.status === "failed") return "problems";
      if (application.status === "success" || ["UNCONFIRMED", "SUBMISSION_STARTED"].includes(application.submitConfirmation ?? "")) return "unverified";
      return application.status === "ready_to_apply" ? "prepared" : null;
  }
}

export async function runDailySummary(opts?: { onlyEmail?: string; dryRun?: boolean }): Promise<DailySummaryResult> {
  const since = new Date(Date.now() - COOLDOWN_MS);
  // A delivery/bounce event can arrive days after processing finished. Include
  // recent attempt updates and classify only the newest attempt per application.
  const recentActivity = { OR: [
    { completedAt: { gte: since } },
    { emailAttempts: { some: { updatedAt: { gte: since } } } },
  ] };
  const active = await prisma.application.groupBy({
    by: ["userId"],
    where: { ...recentActivity, ...(opts?.onlyEmail ? { user: { email: opts.onlyEmail } } : {}) },
    _count: { _all: true },
  });
  const result: DailySummaryResult = { sent: 0, skipped: 0, errors: 0, details: [] };
  const apiKey = process.env.RESEND_API_KEY;
  for (const group of active) {
    const user = await prisma.user.findUnique({ where: { id: group.userId }, select: { id: true, email: true, name: true, locale: true } });
    if (!user || isTestAccount(user.email)) {
      result.details.push({ email: user?.email ?? "?", status: user ? "test_skip" : "user_not_found" });
      result.skipped++; continue;
    }
    const recent = await prisma.emailLog.count({ where: { kind: "daily_summary", to: user.email, createdAt: { gte: since }, ...EMAIL_LOG_SUCCESS_WHERE } });
    if (recent > 0) { result.details.push({ email: user.email, status: "cooldown" }); result.skipped++; continue; }
    const apps = await prisma.application.findMany({
      where: { userId: user.id, ...recentActivity },
      select: {
        status: true, submitConfirmation: true, submittedVia: true, submissionReceiptJson: true,
        emailAttempts: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, providerEmailId: true } },
        job: { select: { title: true, company: true, url: true } },
      },
      orderBy: { completedAt: "desc" },
    });
    const activity: UserActivity = {
      portal: { count: 0, jobs: [] }, delivered: { count: 0, jobs: [] },
      accepted: { count: 0, jobs: [] }, no_bounce: { count: 0, jobs: [] },
      unknown: { count: 0, jobs: [] }, pending: { count: 0, jobs: [] },
      problems: { count: 0, jobs: [] }, unverified: { count: 0, jobs: [] },
      prepared: { count: 0, jobs: [] },
    };
    for (const app of apps) {
      const kind = summaryKind(app);
      if (!kind) continue;
      activity[kind].count++;
      if (activity[kind].jobs.length < 8) activity[kind].jobs.push({ title: app.job?.title ?? "?", company: app.job?.company ?? null, url: app.job?.url ?? "#" });
    }
    if (!KINDS.some((kind) => activity[kind].count > 0)) {
      result.details.push({ email: user.email, status: "no_activity" }); result.skipped++; continue;
    }
    const counts = KINDS.map((kind) => `${kind}=${activity[kind].count}`).join(",");
    if (opts?.dryRun) { result.details.push({ email: user.email, status: "dry_run", counts }); continue; }
    if (!apiKey) { result.details.push({ email: user.email, status: "no_resend_key", counts }); result.skipped++; continue; }
    try {
      const { subject, html, text } = renderSummary(user, activity);
      const notification = await sendWithinQuota("daily_summary", user.email, async () => {
        return new Resend(apiKey).emails.send({
          from: process.env.EMAIL_FROM ?? "LavorAI <onboarding@resend.dev>", to: user.email, subject, html, text,
        });
      });
      if (!notification.sent) {
        if (notification.outcome === "failed" || notification.outcome === "unknown") {
          console.warn("[daily-summary] send_failed", {
            path: "runDailySummary",
            kind: "daily_summary",
            to: redactEmailAddress(user.email),
            outcome: notification.outcome,
            reason: notification.reason,
          });
          result.details.push({ email: user.email, status: "error: " + (notification.reason ?? notification.outcome), counts });
          result.errors++; continue;
        }
        result.details.push({ email: user.email, status: "quota_blocked", counts }); result.skipped++; continue;
      }
      result.details.push({ email: user.email, status: "accepted", counts }); result.sent++;
    } catch (error) {
      const message = error instanceof Error ? scrubResendSecretText(error.message).slice(0, 80) : "Provider request failed";
      console.warn("[daily-summary] send_failed", {
        path: "runDailySummary",
        kind: "daily_summary",
        to: redactEmailAddress(user.email),
        errorName: error instanceof Error ? error.name : "Error",
        message,
      });
      result.details.push({ email: user.email, status: "error: " + message });
      result.errors++;
    }
  }
  return result;
}

function renderSummary(user: { email: string; name: string | null; locale: string | null }, activity: UserActivity): { subject: string; html: string; text: string } {
  const en = user.locale === "en";
  const first = user.name?.trim().split(/\s+/)[0];
  const greeting = first ? (en ? `Hi ${first},` : `Ciao ${first},`) : en ? "Hi," : "Ciao,";
  const labels: Record<SummaryKind, string> = en ? {
    portal: "Portal submissions with a verified application receipt",
    delivered: "Email delivery confirmed by the provider; no proof of reading",
    accepted: "Emails accepted by the provider; delivery still pending",
    no_bounce: "Mailbox sends with no bounce; not confirmed employer acceptance",
    unknown: "Send attempted, outcome unknown, no stored proof",
    pending: "Email attempts awaiting a verifiable outcome",
    problems: "Failed applications, bounced emails or other delivery problems",
    unverified: "Applications with unverified submission or historical records without delivery proof",
    prepared: "Prepared applications that still need your review or completion",
  } : {
    portal: "Candidature su portale con ricevuta verificata",
    delivered: "Email con consegna confermata dal provider; lettura non verificata",
    accepted: "Email accettate dal provider; consegna ancora in attesa",
    no_bounce: "Invii dalla casella senza rimbalzo; non è un'accettazione dell'azienda",
    unknown: "Invio tentato, esito sconosciuto, nessuna prova memorizzata",
    pending: "Tentativi email in attesa di un esito verificabile",
    problems: "Candidature fallite, email respinte o altri problemi di consegna",
    unverified: "Candidature non confermate o storico senza prova di consegna",
    prepared: "Candidature preparate che richiedono ancora verifica o completamento",
  };
  const total = KINDS.reduce((sum, kind) => sum + activity[kind].count, 0);
  const subject = en ? `Application update: ${total} recent records` : `Aggiornamento candidature: ${total} attività recenti`;
  const intro = en ? "Here are the latest observed states for applications with activity in the last 24 hours." : "Ecco gli ultimi stati verificabili delle candidature con attività nelle ultime 24 ore.";
  const caution = en ? "A submission or delivery receipt does not mean a recruiter has read or answered your application. Check unverified outcomes before sending again to avoid duplicates." : "Una ricevuta di invio o consegna non significa che il recruiter abbia letto o risposto. Verifica gli esiti incerti prima di inviare di nuovo, per evitare duplicati.";
  const url = `${(process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it").replace(/\/$/, "")}/applications`;
  const groups = KINDS.filter((kind) => activity[kind].count > 0);
  const blocks = groups.map((kind) => {
    const bucket = activity[kind];
    const items = bucket.jobs.map((job) => `<li><a href="${escapeHtml(safeJobUrl(job.url))}">${escapeHtml(job.title)}</a>${job.company ? ` · ${escapeHtml(job.company)}` : ""}</li>`).join("");
    return `<section style="margin:20px 0"><p><strong>${bucket.count}</strong> ${escapeHtml(labels[kind])}</p><ul>${items}</ul></section>`;
  }).join("");
  const cta = en ? "Review application details" : "Controlla i dettagli delle candidature";
  const html = `<!doctype html><html lang="${en ? "en" : "it"}"><body style="font-family:Arial,sans-serif;color:#0F172A;background:#F8FAFC"><main style="max-width:600px;margin:auto;padding:24px"><h1>LavorAI</h1><p>${escapeHtml(greeting)}</p><p>${escapeHtml(intro)}</p>${blocks}<p>${escapeHtml(caution)}</p><p><a href="${escapeHtml(url)}">${cta}</a></p></main></body></html>`;
  const text = [greeting, "", intro, "", ...groups.flatMap((kind) => [
    `${activity[kind].count}: ${labels[kind]}`,
    ...activity[kind].jobs.map((job) => `  - ${job.title}${job.company ? ` @ ${job.company}` : ""}`), "",
  ]), caution, "", `${cta}: ${url}`, "", "LavorAI"].join("\n");
  return { subject, html, text };
}
function safeJobUrl(raw: string): string {
  try { const url = new URL(raw); return ["https:", "http:"].includes(url.protocol) ? url.href : "#"; } catch { return "#"; }
}
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
