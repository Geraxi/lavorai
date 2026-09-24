import { prisma } from "@/lib/db";

export interface AutoApplyReadiness {
  tone: "ready" | "action" | "paused";
  eyebrow: string;
  title: string;
  detail: string;
  cta: string;
  href: string;
}

/** A concise, user-facing explanation of why applications are or are not moving. */
export async function getAutoApplyReadiness(userId: string, matchingJobs: number): Promise<AutoApplyReadiness> {
  const [preferences, cvCount, sent, needsAnswers, waitingForConsent] = await Promise.all([
    prisma.userPreferences.findUnique({ where: { userId }, select: { autoApplyMode: true, rolesJson: true, locationsJson: true } }),
    prisma.cVDocument.count({ where: { userId } }),
    prisma.application.count({ where: { userId, status: "success" } }),
    prisma.application.count({ where: { userId, status: "needs_answers" } }),
    prisma.application.count({ where: { userId, status: "awaiting_consent" } }),
  ]);
  const listHasItems = (value: string | null | undefined) => {
    try { return Array.isArray(JSON.parse(value ?? "[]")) && JSON.parse(value ?? "[]").length > 0; } catch { return false; }
  };
  const hasRoles = listHasItems(preferences?.rolesJson);
  const hasLocations = listHasItems(preferences?.locationsJson);

  if (!cvCount) return { tone: "action", eyebrow: "Auto-apply", title: "In attesa del tuo CV", detail: "Carica un CV, anche una prima bozza: è il documento che LavorAI adatta a ogni candidatura.", cta: "Carica il CV", href: "/onboarding" };
  if (!hasRoles || !hasLocations) return { tone: "action", eyebrow: "Auto-apply", title: "Imposta i ruoli e le località", detail: "Ci servono per cercare offerte compatibili con il tuo profilo.", cta: "Imposta preferenze", href: "/preferences" };
  if (preferences?.autoApplyMode === "off") return { tone: "paused", eyebrow: "Auto-apply", title: "La ricerca automatica è in pausa", detail: "Riattivala dalle Preferenze quando vuoi riprendere a cercare e candidarti.", cta: "Riattiva auto-apply", href: "/preferences" };
  if (needsAnswers > 0) return { tone: "action", eyebrow: "Auto-apply", title: `${needsAnswers} ${needsAnswers === 1 ? "candidatura richiede" : "candidature richiedono"} una risposta`, detail: "Completa le informazioni richieste per farle proseguire.", cta: "Completa le risposte", href: "/applications" };
  if (waitingForConsent > 0) return { tone: "action", eyebrow: "Auto-apply", title: `${waitingForConsent} ${waitingForConsent === 1 ? "candidatura attende" : "candidature attendono"} il tuo consenso`, detail: "Rivedile e conferma quelle che vuoi inviare.", cta: "Rivedi candidature", href: "/applications" };
  if (matchingJobs === 0) return { tone: "ready", eyebrow: "Auto-apply", title: "Ricerca attiva", detail: "Non ci sono ancora offerte compatibili nel pool. LavorAI continua a cercare per te.", cta: "Vedi preferenze", href: "/preferences" };
  if (sent > 0) return { tone: "ready", eyebrow: "Auto-apply", title: "Auto-apply al lavoro", detail: `Hai già ${sent} ${sent === 1 ? "candidatura inviata" : "candidature inviate"}. Stiamo monitorando ${matchingJobs} offerte compatibili.`, cta: "Vedi candidature", href: "/applications" };
  return { tone: "ready", eyebrow: "Auto-apply", title: "Profilo pronto, ricerca attiva", detail: `Stiamo valutando ${matchingJobs} offerte compatibili con le tue preferenze.`, cta: "Vedi le offerte", href: "/jobs" };
}
