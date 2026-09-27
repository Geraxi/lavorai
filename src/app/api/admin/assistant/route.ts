import { NextResponse, type NextRequest } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isAdmin, isTestAccount } from "@/lib/admin";

export const runtime = "nodejs";
export const maxDuration = 45;

const MODEL = process.env.OPENAI_MODEL_STRONG ?? "gpt-5.6-terra";

/**
 * Admin-only analytics assistant. The OpenAI request contains only the
 * aggregate snapshot built below: no user emails, CVs, application/job text,
 * session identifiers, or raw failure messages leave LavorAI.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { messages?: Array<{ role: string; content: string }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const messages = Array.isArray(body.messages)
    ? body.messages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({
          role: message.role as "user" | "assistant",
          content: String(message.content ?? "").slice(0, 2_000),
        }))
        .filter((message) => message.content.length > 0)
        .slice(-12)
    : [];

  if (messages.length === 0) {
    return NextResponse.json({ error: "no_messages" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ai_not_configured", message: "OPENAI_API_KEY mancante." },
      { status: 503 },
    );
  }

  const snapshot = await buildAggregateSnapshot();
  const conversation = messages
    .map((message) => `${message.role === "user" ? "FOUNDER" : "ASSISTANT"}: ${message.content}`)
    .join("\n\n");

  const instructions = `Sei l'assistente AI interno, solo per gli amministratori, di LavorAI.

Rispondi in italiano al founder usando esclusivamente lo snapshot aggregato qui sotto e la conversazione. Sii concreto, sintetico e onesto: se un dato non è disponibile, dillo. Dai priorità a crescita, conversione, attivazione, consegna delle candidature e affidabilità operativa. Puoi fare calcoli sulle metriche aggregate.

PRIVACY: lo snapshot non contiene dati personali, CV, testo delle candidature, nomi delle aziende o errori grezzi. Non chiedere né dedurre dati personali. Non suggerire di inviare email, modificare account, effettuare pagamenti o altre azioni esterne: questa chat è solo analisi e supporto decisionale.

=== SNAPSHOT AGGREGATO LIVE (${new Date().toISOString()}) ===
${snapshot}
=== FINE SNAPSHOT ===`;

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model: MODEL,
      store: false,
      max_output_tokens: 1_400,
      temperature: 0.2,
      instructions,
      input: conversation,
    });
    const reply = response.output_text.trim();
    if (!reply) throw new Error("Risposta AI vuota");

    return NextResponse.json({ ok: true, reply, provider: "openai", model: MODEL });
  } catch (error) {
    console.error("[admin/assistant]", error);
    return NextResponse.json(
      { error: "ai_error", message: error instanceof Error ? error.message : "AI failure" },
      { status: 500 },
    );
  }
}

/** Builds a compact, aggregate-only operational snapshot for the assistant. */
async function buildAggregateSnapshot(): Promise<string> {
  const now = Date.now();
  const since = (hours: number) => new Date(now - hours * 3_600_000);
  const sevenDaysAgo = since(24 * 7);
  const thirtyDaysAgo = since(24 * 30);

  const [
    users,
    applicationsTotal,
    applications7d,
    applicationsByStatus,
    applicationsByConfirmation,
    applicationsByPortal7d,
    applicationsByVia7d,
    captcha30d,
    needsAnswers,
    activeSessions,
    autoApplyModes,
    jobsBySource,
    jobs24h,
    jobs7d,
    closedJobs,
    newestJob,
    emailsByKind7d,
    pageViews7d,
    trafficReferrers7d,
    subscriptionStatuses,
  ] = await Promise.all([
    // Email is selected only to exclude test/internal accounts locally. It is never returned.
    prisma.user.findMany({
      select: { email: true, tier: true, subscriptionStatus: true, emailVerified: true, createdAt: true },
    }),
    prisma.application.count(),
    prisma.application.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.application.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.application.groupBy({ by: ["submitConfirmation"], _count: { _all: true } }),
    prisma.application.groupBy({
      by: ["portal"],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { _all: true },
      orderBy: { _count: { portal: "desc" } },
      take: 8,
    }),
    prisma.application.groupBy({
      by: ["submittedVia"],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { _all: true },
      orderBy: { _count: { submittedVia: "desc" } },
    }),
    prisma.application.count({
      where: { submitConfirmation: "CAPTCHA", createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.application.count({ where: { status: "needs_answers" } }),
    prisma.applicationSession.count({ where: { status: { in: ["active", "auto"] } } }),
    prisma.userPreferences.groupBy({ by: ["autoApplyMode"], _count: { _all: true } }),
    prisma.job.groupBy({ by: ["source"], _count: { _all: true } }),
    prisma.job.count({ where: { cachedAt: { gte: since(24) } } }),
    prisma.job.count({ where: { cachedAt: { gte: sevenDaysAgo } } }),
    prisma.job.count({ where: { closedAt: { not: null } } }),
    prisma.job.findFirst({ orderBy: { cachedAt: "desc" }, select: { cachedAt: true } }),
    prisma.emailLog.groupBy({
      by: ["kind"],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { _all: true },
    }),
    prisma.pageView.count({ where: { ts: { gte: sevenDaysAgo } } }).catch(() => 0),
    prisma.pageView
      .groupBy({
        by: ["referrer"],
        where: { ts: { gte: sevenDaysAgo }, referrer: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { referrer: "desc" } },
        take: 20,
      })
      .catch(() => []),
    prisma.user.groupBy({ by: ["subscriptionStatus"], _count: { _all: true } }).catch(() => []),
  ]);

  const realUsers = users.filter((account) => !isTestAccount(account.email));
  const realNew7d = realUsers.filter((account) => account.createdAt >= sevenDaysAgo).length;
  const realNew30d = realUsers.filter((account) => account.createdAt >= thirtyDaysAgo).length;
  const realVerified = realUsers.filter((account) => account.emailVerified !== null).length;
  const realPaying = realUsers.filter(
    (account) =>
      (account.tier === "pro" || account.tier === "pro_plus") && account.subscriptionStatus === "active",
  ).length;
  const paidTrials = realUsers.filter(
    (account) => account.tier === "pro" || account.tier === "pro_plus",
  ).length;

  const confirmationCounts = Object.fromEntries(
    applicationsByConfirmation.map((row) => [row.submitConfirmation ?? "unknown", row._count._all]),
  );
  const hardConfirmed = Object.entries(confirmationCounts)
    .filter(([confirmation]) => confirmation.startsWith("DETECTED"))
    .reduce((total, [, count]) => total + count, 0);
  const submitted = applicationsByStatus.find((row) => row.status === "success")?._count._all ?? 0;
  const failed = applicationsByStatus.find((row) => row.status === "failed")?._count._all ?? 0;
  const pending = applicationsTotal - submitted - failed;
  const referrerTotals = aggregateReferrers(trafficReferrers7d);

  return [
    `UTENTI REALI: ${realUsers.length} totali; ${realNew7d} nuovi negli ultimi 7 giorni; ${realNew30d} nuovi negli ultimi 30 giorni; ${realVerified} verificati; ${realUsers.length - realVerified} da verificare.`,
    `PAGAMENTI: ${realPaying} abbonamenti attivi paganti; ${paidTrials} utenti su tier Pro/Pro+ (può includere prove); stati abbonamento complessivi: ${formatCounts(subscriptionStatuses.map((row) => [row.subscriptionStatus ?? "none", row._count._all]))}.`,
    `CANDIDATURE: ${applicationsTotal} totali; ${applications7d} create negli ultimi 7 giorni; ${submitted} con status success; ${failed} fallite; ${pending} negli altri stati.`,
    `FUNNEL CONSEGNA: ${applicationsTotal} tentate → ${submitted} inviate/success → ${hardConfirmed} con conferma hard DETECTED_*. Conferme per classe: ${formatCounts(Object.entries(confirmationCounts))}.`,
    `CANALI CANDIDATURA 7G: ${formatCounts(applicationsByVia7d.map((row) => [row.submittedVia ?? "unknown", row._count._all]))}. Portali 7g: ${formatCounts(applicationsByPortal7d.map((row) => [row.portal ?? "unknown", row._count._all]))}.`,
    `BLOCCHI OPERATIVI: ${captcha30d} captcha negli ultimi 30 giorni; ${needsAnswers} candidature che richiedono risposte dell'utente; ${activeSessions} sessioni auto-apply attive. Nessun messaggio di errore grezzo è incluso.`,
    `TRAFFICO INTERNO 7G: ${pageViews7d} page view. Referrer aggregati: ${formatCounts(referrerTotals)}. Il beacon interno non fornisce visite GA/Vercel o utenti unici.`,
    `JOB POOL: ${formatCounts(jobsBySource.map((row) => [row.source, row._count._all]))}; ${jobs24h} job aggiornati nelle ultime 24h; ${jobs7d} negli ultimi 7 giorni; ${closedJobs} chiusi; job più recente: ${newestJob?.cachedAt?.toISOString() ?? "mai"}.`,
    `EMAIL 7G (soli volumi per categoria): ${formatCounts(emailsByKind7d.map((row) => [row.kind, row._count._all]))}.`,
    `AUTO-APPLY: modalità aggregate: ${formatCounts(autoApplyModes.map((row) => [row.autoApplyMode, row._count._all]))}.`,
    `SNAPSHOT TIME: ${new Date().toISOString()}.`,
  ].join("\n");
}

function aggregateReferrers(
  rows: Array<{ referrer: string | null; _count: { _all: number } }>,
): Array<[string, number]> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const host = referrerHost(row.referrer);
    totals.set(host, (totals.get(host) ?? 0) + row._count._all);
  }
  return [...totals.entries()].sort(([, first], [, second]) => second - first).slice(0, 8);
}

function referrerHost(referrer: string | null): string {
  if (!referrer) return "direct/unknown";
  try {
    return new URL(referrer).hostname.replace(/^www\./, "") || "direct/unknown";
  } catch {
    return "unknown";
  }
}

function formatCounts(entries: Array<[string, number]>): string {
  return entries.length ? entries.map(([label, count]) => `${label}=${count}`).join(", ") : "nessun dato";
}
