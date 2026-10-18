/**
 * Copy condivisa per le FAQ della pagina /pricing.
 *
 * Regole di posizionamento (ott. 2026): LavorAI trova opportunità
 * rilevanti, prepara candidature su misura (CV + lettera) e traccia i
 * progressi, mentre l'utente controlla gli invii. L'invio automatico è
 * un'opzione che l'utente attiva, non una promessa di default.
 *
 * Niente testimonial, case study o metriche inventate: la vecchia
 * sezione placeholder (TESTIMONIALS, CASE_STUDIES, SUCCESS_METRICS) è
 * stata rimossa. Aggiungere prove solo quando sono reali, verificabili e
 * con consenso della persona citata.
 */

export interface FaqItem {
  /** Domanda diretta, prima persona ("Posso..."). */
  q: string;
  /** Risposta 2-4 frasi. Diretta, senza promesse di risultato. */
  a: string;
}

export const FAQ_OBJECTIONS: FaqItem[] = [
  {
    q: "Cosa fa LavorAI, esattamente?",
    a: "Trova opportunità coerenti con il tuo profilo, prepara una candidatura su misura per ciascuna (CV adattato e lettera di presentazione) e tiene traccia di ogni passaggio. Sei tu a decidere quando una candidatura parte.",
  },
  {
    q: "Rimango io a controllare cosa viene inviato?",
    a: "Sì. Con la modalità con conferma rivedi CV e lettera e approvi ogni invio. Se vuoi, dalle preferenze puoi attivare l'invio automatico sopra una soglia di compatibilità che scegli tu, e disattivarlo in qualsiasi momento.",
  },
  {
    q: "Il CV su misura cambia le mie esperienze?",
    a: "No. LavorAI riordina e riformula il tuo materiale per l'annuncio, ma datori di lavoro, ruoli, date e titoli di studio restano quelli del tuo CV. Prima di approvare vedi le differenze rispetto all'originale.",
  },
  {
    q: "Su quali portali funziona?",
    a: "Sui form pubblici degli ATS supportati, come Greenhouse, Lever, Ashby e Workable. Un annuncio trovato su LinkedIn o Indeed è candidabile solo se rimanda a un canale supportato. Non chiediamo né conserviamo le tue credenziali di LinkedIn o Indeed.",
  },
  {
    q: "I miei dati sono al sicuro?",
    a: "Il database principale è nella regione europea di Neon (Francoforte). Il CV viene elaborato solo dai fornitori necessari indicati nella privacy policy. I dati non vengono venduti; puoi esportarli o cancellare account, CV e candidature dalle impostazioni.",
  },
  {
    q: "Una candidatura inviata significa un colloquio?",
    a: "No. Una ricevuta ATS o la consegna al server email documentano l'invio, non una lettura o una risposta. Le risposte dei recruiter sono tracciate a parte. LavorAI non garantisce colloqui né offerte.",
  },
  {
    q: "Cosa succede dopo la registrazione?",
    a: "Carichi il CV, confermi profilo, ruoli e città, poi vedi le prime opportunità con i documenti già preparati. Rivedi, approvi l'invio e segui lo stato di ogni candidatura dalla dashboard.",
  },
];
