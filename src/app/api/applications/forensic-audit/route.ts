import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

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
        ? "⚠️ CRITICO: nessuna email nel CV profile. Le candidature partono con email vuota → server le rifiuta o le accetta ma le risposte arrivano in un buco nero."
        : cvEmail.toLowerCase() !== accountEmail.toLowerCase()
          ? `⚠️ L'email del CV (${cvEmail}) è DIVERSA dalla tua di login (${accountEmail}). Le conferme dei recruiter arrivano a ${cvEmail}, non a ${accountEmail}. Hai accesso a quella mailbox?`
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
        ? "🚨 ZERO candidature hanno una prova di consegna confermata. Devi indagare prima di confidare nel funnel."
        : `${buckets.confirmedDelivered} candidature con prova hard di consegna (HTTP 2xx server-confirmed).`,
    emailCheck,
    buckets,
    interpretation: interpretBuckets(buckets, emailCheck),
    detailed,
  });
}

function forensicVerdict(a: {
  status: string;
  submittedVia: string | null;
  submitConfirmation: string | null;
  errorMessage: string | null;
}): { label: string; color: "confirmedDelivered" | "probablyDelivered" | "unconfirmed" | "notDelivered" | "inFlight"; detail: string } {
  if (a.status === "queued" || a.status === "optimizing" || a.status === "applying") {
    return { label: "⏳ In coda (worker non finito)", color: "inFlight", detail: "Il pipeline non ha ancora completato. Riprova check tra qualche minuto." };
  }
  if (a.status === "failed") {
    return { label: "❌ Fallita", color: "notDelivered", detail: a.errorMessage ?? "Workflow fallito senza messaggio." };
  }
  if (a.status === "ready_to_apply") {
    return { label: "⚠️ Pronta ma NON inviata", color: "notDelivered", detail: a.errorMessage ?? "Form compilato, submit non andato a buon fine. Verifica manualmente sul portale." };
  }
  if (a.status === "success") {
    // Forensic-grade verdict basato su submitConfirmation
    if (a.submitConfirmation?.startsWith("DETECTED_HTTP")) {
      return { label: "✅ Consegnata (server-confirmed)", color: "confirmedDelivered", detail: `Adapter ha catturato risposta HTTP ${a.submitConfirmation}. Alta confidenza.` };
    }
    if (a.submitConfirmation === "DETECTED_DOM") {
      return { label: "✅ Consegnata (thank-you page rilevata)", color: "confirmedDelivered", detail: "L'adapter ha visto una pagina di conferma del portale. Buona confidenza." };
    }
    if (a.submitConfirmation === "MANUAL") {
      return { label: "📝 Import manuale", color: "probablyDelivered", detail: "Inserita a mano dall'utente. Stato auto-dichiarato." };
    }
    if (a.submittedVia === "email_recruiter") {
      return { label: "📧 Via email recruiter", color: "probablyDelivered", detail: "Spedita via SMTP (Resend). Deliverability dipende dal recipient. Niente conferma applicativa dal portale ATS." };
    }
    if (a.submitConfirmation === "UNCONFIRMED") {
      return { label: "⚠️ UNCONFIRMED (status success ma niente prova)", color: "unconfirmed", detail: "Status marcato success ma submitConfirmation = UNCONFIRMED. Submit cliccato, niente HTTP response o thank-you page rilevata. Possibile false-success." };
    }
    if (a.submitConfirmation === null && a.submittedVia?.startsWith("portal_")) {
      return { label: "⚠️ PRE-FIX (submitConfirmation non tracciato)", color: "unconfirmed", detail: "Candidatura processata prima del fix false-success. Non possiamo dire retroattivamente se era DETECTED o UNCONFIRMED. Verifica manualmente sul portale." };
    }
    return { label: "⚠️ Success ma stato anomalo", color: "unconfirmed", detail: `submittedVia=${a.submittedVia} submitConfirmation=${a.submitConfirmation}. Caso non previsto.` };
  }
  return { label: `Stato sconosciuto: ${a.status}`, color: "unconfirmed", detail: "Status non riconosciuto dal verdict engine." };
}

function interpretBuckets(
  b: { confirmedDelivered: number; probablyDelivered: number; unconfirmed: number; notDelivered: number; inFlight: number },
  emailCheck: { match: boolean; warning: string | null },
): string {
  const lines: string[] = [];
  if (emailCheck.warning) lines.push(emailCheck.warning);
  if (b.confirmedDelivered === 0 && b.unconfirmed > 0) {
    lines.push(
      `🚨 ZERO candidature server-confirmed, ${b.unconfirmed} marcate "success" senza prova. Probabile che il portal adapter clicchi submit ma il server le rifiuti silenziosamente (campo required mancante, captcha, validazione lato client). Soluzione: ispezionare manualmente 1-2 candidature recenti — la URL del job è nella lista sotto. Se loggandoti su Greenhouse non risulti come applicant, il submit non è mai arrivato al server.`,
    );
  }
  if (b.confirmedDelivered === 0 && b.probablyDelivered > 0) {
    lines.push(
      `${b.probablyDelivered} candidature inviate via email recruiter (fallback SMTP). Quelle sono LEGITTIMAMENTE consegnate al recipient via SMTP via Resend. MA: l'email può finire in spam, o il recruiter non risponde. Lì è una questione di deliverability + qualità del recipient.`,
    );
  }
  if (b.notDelivered > 0) {
    lines.push(`${b.notDelivered} candidature mai partite (status failed o ready_to_apply). Vedi errorMessage di ognuna sotto.`);
  }
  if (b.confirmedDelivered > 0) {
    lines.push(`✅ ${b.confirmedDelivered} candidature con prova hard di consegna (HTTP 2xx server confirmed). Quelle DOVREBBERO essere arrivate ai recruiter.`);
  }
  if (lines.length === 0) {
    lines.push("Nessuna candidatura recente da analizzare.");
  }
  return lines.join("\n\n");
}
