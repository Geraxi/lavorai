import { isLifetimeProPlus } from "@/lib/billing";

/**
 * Regole di hint personali da iniettare nella cover letter (NON nel CV).
 * Vivono nel codice: per modificarle serve un deploy. Privacy-friendly:
 * nessuna PII extra finisce in DB.
 *
 * Quando aggiungi un hint:
 *  1. Controlla match su email (canonicalizzata via isLifetimeProPlus — cioè
 *     ignora punti/+tag per Gmail).
 *  2. Controlla match sul ruolo/settore (isTechRole() per IT).
 *  3. Se entrambi matchano → ritorna l'hint in linguaggio naturale;
 *     Claude lo intreccerà nella cover letter.
 */

/**
 * Detect se un job posting è IT / tecnico.
 * Euristica semplice: category Adzuna O keyword comuni nel titolo.
 */
export function isTechRole(
  job: { title: string; category: string | null | undefined },
): boolean {
  const t = (job.title ?? "").toLowerCase();
  const c = (job.category ?? "").toLowerCase();
  if (/(it|engineering|technology|computing|software|tech)\s*jobs?/.test(c)) {
    return true;
  }
  return /\b(developer|engineer|software|backend|frontend|front[- ]?end|back[- ]?end|full[- ]?stack|devops|sre|data scientist|data engineer|machine learning|ml engineer|ai engineer|programmer|architect|sysadmin|tech lead|qa engineer|test engineer|mobile (ios|android) dev|cloud engineer|platform engineer|sviluppatore|programmatore|ingegnere (del )?software)\b/.test(
    t,
  );
}

/**
 * Ritorna la lista di hint da iniettare nella cover letter per (email, job).
 */
export function coverLetterHintsFor(
  email: string | null | undefined,
  job: { title: string; category: string | null },
): string[] {
  const hints: string[] = [];

  // Umberto Geraci — founder. Per ruoli IT/tech vuole che la CL menzioni
  // (senza dirlo letterale) che sta candidandosi dalla piattaforma che ha
  // costruito lui stesso per candidarsi ai ruoli che gli interessano.
  if (isLifetimeProPlus(email) && isTechRole(job)) {
    // match sulla sola email di Umberto (non Antonella) tramite substring
    const canon = (email ?? "").toLowerCase().replace(/\./g, "");
    if (canon.startsWith("umbertogeraci0@")) {
      hints.push(
        "Sottolinea in una frase il tuo forte interesse per questo settore e il fatto — detto con naturalezza, non come vanto — che questa stessa candidatura sta arrivando attraverso una piattaforma che hai progettato e costruito tu proprio per candidarti a ruoli come questo. Usalo come prova concreta di passione + skill tecniche, non come auto-celebrazione.",
      );
    }
  }

  return hints;
}
