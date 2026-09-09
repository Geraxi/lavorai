import type { Locator, Page } from "playwright";

/**
 * Sceglie il VERO bottone di invio del form di candidatura.
 *
 * Bug storico: un locator a lista ("button[type=submit], button:has-text('Apply')…")
 * restituisce gli elementi in ORDINE DOM, non in ordine di selettore. Su
 * Greenhouse job-boards (e su molte career page) il primo match era il
 * bottone "Apply" in cima alla pagina, che si limita a scrollare al form:
 * click "riuscito", nessuna POST, candidatura mai partita (0.7% di
 * conferme su Greenhouse).
 *
 * Priorità:
 *   1. button/input type=submit dentro un <form> (l'ultimo: i form multi-step
 *      mettono "Submit" in fondo)
 *   2. bottone type=submit ovunque
 *   3. bottone con testo esplicito di invio ("Submit application", "Invia
 *      candidatura", …), escludendo quelli fuori da un form
 *   4. null → il chiamante gestisce "bottone non trovato"
 */
export async function findSubmitButton(page: Page): Promise<Locator | null> {
  const candidates: Locator[] = [
    page.locator('form button[type="submit"]:visible, form input[type="submit"]:visible').last(),
    page.locator('button[type="submit"]:visible, input[type="submit"]:visible').last(),
    page
      .locator("form button:visible, form [role=button]:visible")
      .filter({ hasText: /submit application|submit|invia candidatura|invia|send application|apply now|candidati/i })
      .last(),
    page
      .locator("button:visible")
      .filter({ hasText: /submit application|invia candidatura|send application/i })
      .last(),
  ];
  for (const c of candidates) {
    if ((await c.count().catch(() => 0)) > 0) return c;
  }
  return null;
}
