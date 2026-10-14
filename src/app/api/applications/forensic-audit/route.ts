import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { applicationDeliveryView } from "@/lib/application-delivery-view";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/applications/forensic-audit
 *
 * Audit forensico delle ultime 50 candidature. Per ognuna dice ESATTAMENTE:
 *   - status pipeline
 *   - submittedVia (portal_X / email_recruiter / null)
 *   - submitConfirmation (DETECTED_HTTP_2xx / DETECTED_DOM / UNCONFIRMED / null)
 *   - errorMessage se fallita
 *   - se l'email del CV profile è coerente
 *
 * Output: 3 sezioni
 *   1. Sommario: quante per ciascun "scenario reale" (consegnata davvero,
 *      probabilmente non consegnata, sicuramente non consegnata)
 *   2. Email check: l'email registrata sul CV profile (usata per ricevere
 *      conferme dai recruiter) coincide con la tua email di login?
 *   3. Lista dettagliata con verdetto per-application
 *
 * Pensato per rispondere alla domanda: "le candidature arrivano davvero?".
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "auth_required" }, { status: 401 });

  // CV profile email check
  const profile = await prisma.cVProfile.findUnique({
    where: { userId: user.id },
    select: { email: true, firstName: true, lastName: true },
  });

  const cvEmail = profile?.email?.trim() ?? "";
  const accountEmail = user.email.trim();
  const emailCheck = {
    accountEmail,
    cvProfileEmail: cvEmail || "(vuoto)",
    match:
      !!cvEmail &&
      cvEmail.toLowerCase() === accountEmail.toLowerCase(),
    warning:
      !cvEmail
        ? "Il CV non contiene un'email. Il flusso usa l'alias LavorAI o l'email dell'account; completa il CV per chi lo legge direttamente."
        : cvEmail.toLowerCase() !== accountEmail.toLowerCase()
          ? "Il CV e l'account riportano indirizzi diversi. Chi legge il CV potrebbe usare quell'indirizzo; controlla di potervi accedere."
          : null,
    cvName:
      profile?.firstName || profile?.lastName
        ? `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim()
        : "(vuoto)",
  };

  // Last 50 applications
  const apps = await prisma.application.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      submittedVia: true,
      submitConfirmation: true,
      submissionReceiptJson: true,
      emailAttempts: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, providerEmailId: true, acceptedAt: true } },
      errorMessage: true,
      createdAt: true,
      completedAt: true,
      job: { select: { title: true, company: true, url: true } },
    },
  });

  // Forensic verdict per application
  const detailed = apps.map((a) => {
    const verdict = forensicVerdict(a);
    return {
      id: a.id,
      job: `${a.job.title} @ ${a.job.company ?? "?"}`,
      url: a.job.url,
      createdAt: a.createdAt,
      completedAt: a.completedAt,
      status: a.status,
      submittedVia: a.submittedVia,
      submitConfirmation: a.submitConfirmation,
      errorMessage: a.errorMessage?.slice(0, 200),
      verdict: verdict.label,
      verdictColor: verdict.color,
      verdictDetail: verdict.detail,
    };
  });

  // Aggregate buckets
  const buckets = {
    confirmedDelivered: 0,    // HTTP 2xx/3xx o DOM thank-you confermati
    probablyDelivered: 0,     // submittedVia=email_recruiter (no Greenhouse but real SMTP)
    unconfirmed: 0,           // status success ma submitConfirmation = null o UNCONFIRMED
    notDelivered: 0,          // failed o ready_to_apply
    inFlight: 0,              // queued / optimizing / applying
  };
  for (const a of detailed) {
    buckets[a.verdictColor]++;
  }

  return NextResponse.json({
    headline:
      buckets.confirmedDelivered === 0
        ? "Nessuna prova verificabile di ricezione nelle candidature analizzate. Gli invii storici possono avere dati incompleti."
        : `${buckets.confirmedDelivered} candidature con ricevuta ATS verificata o consegna email confermata dal provider.`,
    emailCheck,
    buckets,
    interpretation: interpretBuckets(buckets, emailCheck),
    detailed,
  });
}

function forensicVerdict(a: Parameters<typeof applicationDeliveryView>[0] & { errorMessage: string | null }): {
  label: string; color: "confirmedDelivered" | "probablyDelivered" | "unconfirmed" | "notDelivered" | "inFlight"; detail: string;
} {
  const view = applicationDeliveryView(a);
  const color = view.phase === "confirmed" || view.phase === "delivered" ? "confirmedDelivered"
    : view.phase === "accepted" || view.phase === "manual" ? "probablyDelivered"
      : view.phase === "unconfirmed" ? "unconfirmed"
        : view.phase === "failed" ? "notDelivered" : "inFlight";
  return { label: view.label, color, detail: a.errorMessage ? `${view.detail} ${a.errorMessage}` : view.detail };
}

function interpretBuckets(
  b: { confirmedDelivered: number; probablyDelivered: number; unconfirmed: number; notDelivered: number; inFlight: number },
  emailCheck: { match: boolean; warning: string | null },
): string {
  return [
    emailCheck.warning,
    `${b.confirmedDelivered} ricevute ATS o consegne email verificate; non provano una lettura o una futura risposta.`,
    `${b.probablyDelivered} invii accettati dal provider o dichiarati manualmente, senza conferma automatica di consegna.`,
    `${b.unconfirmed} esiti o registrazioni storiche da verificare. Non vanno reinviati automaticamente.`,
    `${b.notDelivered} invii fermati o problemi di consegna; ${b.inFlight} candidature da completare o in elaborazione.`,
  ].filter(Boolean).join("\n\n");
}
