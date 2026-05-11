/**
 * Single source of truth per i proof point della landing.
 *
 * ⚠️ TUTTO QUI È PLACEHOLDER fino a quando non avrai dati reali.
 * Vedi TODO-LAUNCH.md per la checklist di item da sostituire con
 * numeri reali prima del go-live a pagamento.
 *
 * Sostituire i contenuti qui aggiorna automaticamente l'UI senza
 * toccare componenti.
 */

export interface Testimonial {
  /** Nome o iniziali (es. "Marco R."). NON full name reale senza opt-in. */
  name: string;
  /** Ruolo + azienda anonimizzata se necessario ("Product Designer · scaleup SaaS"). */
  role: string;
  /** 1-2 frasi. Specifiche, niente hype. */
  quote: string;
  /** Numero outcome (es. "+12 colloqui in 3 settimane"). Opzionale. */
  outcome?: string;
}

/**
 * PLACEHOLDER — sostituire con testimonial reali raccolti via Resend
 * dopo i primi 50 utenti paganti (vedi TODO-LAUNCH.md).
 */
export const TESTIMONIALS: Testimonial[] = [
  {
    name: "Marco R.",
    role: "Product Designer · scaleup SaaS",
    quote:
      "Avevo perso il conto dei portali. Ora rivedo solo le risposte dei recruiter — la candidatura la fa LavorAI.",
    outcome: "12 colloqui in 3 settimane",
  },
  {
    name: "Giulia S.",
    role: "Junior Developer · neolaureata",
    quote:
      "Ho iniziato con 3 candidature gratuite per testare. La cover letter era così specifica che pensavo l'avessi scritta io.",
    outcome: "Primo colloquio in 6 giorni",
  },
  {
    name: "Andrea C.",
    role: "UX Designer · cerca remoto",
    quote:
      "L'avevo provato per scetticismo. Il giorno dopo ho ricevuto 2 risposte. Mi sono accorto che funzionava davvero.",
    outcome: "2 offer in un mese",
  },
];

/**
 * PLACEHOLDER — sostituire con metriche reali quando avrai cohort
 * dimostrabili. Per ora usiamo numeri prudenti che possiamo difendere
 * (es. "2.000+ candidati italiani" è plausibile dal traffico reale).
 */
export const SUCCESS_METRICS: Array<{
  value: string;
  label: string;
  caveat?: string;
}> = [
  {
    value: "2.000+",
    label: "candidati italiani attivi",
    caveat: "registrati negli ultimi 6 mesi",
  },
  {
    value: "30s",
    label: "tempo medio per una candidatura",
    caveat: "vs ~12 minuti manuali",
  },
  {
    value: "8gg",
    label: "tempo mediano al primo colloquio",
    caveat: "su utenti con CV ottimizzato",
  },
];

/**
 * Case study anonimizzati — narrativa più lunga di una testimonial,
 * con before/after concreti. Per high-intent visitor che vogliono
 * "prova vera" non solo quote.
 *
 * ⚠️ PLACEHOLDER come tutto il resto qui. Sostituire con cohort reali
 * dopo 50+ utenti paganti (vedi TODO-LAUNCH.md → Critical section).
 */
export interface CaseStudy {
  initials: string;
  role: string;
  context: string;
  beforeTitle: string;
  beforeBody: string;
  afterTitle: string;
  afterBody: string;
  metrics: Array<{ value: string; label: string }>;
}

export const CASE_STUDIES: CaseStudy[] = [
  {
    initials: "M.R.",
    role: "Senior Product Designer · cerca svolta in scaleup",
    context:
      "3 anni in un'agenzia, voglia di passare a un prodotto SaaS. Mid-30s, ROI sul tempo > ROI sulla quantità.",
    beforeTitle: "Prima · 2 mesi a vuoto",
    beforeBody:
      "Candidatura manuale su LinkedIn Easy Apply per 6-8 ore alla settimana. CV identico per ogni annuncio. 4 risposte recruiter in 8 settimane, tutte rifiuti automatici.",
    afterTitle: "Dopo 3 settimane con LavorAI",
    afterBody:
      "Auto-apply attivo sui ruoli Senior Product Designer in EU. Cover letter custom per ogni annuncio (citando il prodotto target). Filtro a salary range + companies escluse (3 agency big-tech sue ex).",
    metrics: [
      { value: "73", label: "candidature inviate in 21gg" },
      { value: "12", label: "colloqui prenotati" },
      { value: "2", label: "offer ricevute" },
    ],
  },
  {
    initials: "G.S.",
    role: "Junior Developer · neolaureata in CS",
    context:
      "Senza esperienza professionale formale, 2 progetti GitHub, 6 mesi a candidarsi senza risposte.",
    beforeTitle: "Prima · CV ignorato dagli ATS",
    beforeBody:
      "CV in italiano accademico, nessuna keyword tech, formato grafico che gli ATS faticavano a parsare. 0 colloqui in 6 mesi su ~120 candidature.",
    afterTitle: "Dopo 4 settimane con LavorAI",
    afterBody:
      "CV riformulato con keyword ATS-friendly per ogni annuncio, mantenendo il contenuto reale. Cover letter che cita il progetto GitHub rilevante per ogni azienda. Lavorai si è candidato su startup early-stage che lei non avrebbe considerato.",
    metrics: [
      { value: "47", label: "candidature inviate in 28gg" },
      { value: "5", label: "primi colloqui" },
      { value: "1", label: "offer junior accettata" },
    ],
  },
];

/**
 * Portali ATS supportati per submit automatico. La differenza vs il
 * marketing è importante: LinkedIn/Indeed sono fonti di scoperta job;
 * gli ATS reali (Greenhouse, Lever, Ashby, SmartRecruiters, Workable)
 * sono dove avviene il submit. Mostriamo entrambi.
 */
export const SUPPORTED_PORTALS = {
  discovery: ["LinkedIn", "Indeed", "InfoJobs", "Subito"],
  apply: [
    "Greenhouse",
    "Lever",
    "Ashby",
    "SmartRecruiters",
    "Workable",
  ],
};

/**
 * 7 FAQ structured around objections. Ordine = priorità conversion
 * (data safety → control → coverage → quality → review → audience →
 * post-signup).
 */
export interface FaqItem {
  /** Domanda diretta, prima persona ("Posso..."). */
  q: string;
  /** Risposta 2-4 frasi. Direct, niente vago. */
  a: string;
}

export const FAQ_OBJECTIONS: FaqItem[] = [
  {
    q: "I miei dati sono al sicuro?",
    a: "Sì. Il CV è cifrato a riposo su server europei (Neon · Frankfurt), GDPR-first. Mai venduto, mai condiviso. Puoi esportare tutto in JSON o cancellare account+CV+candidature in 1 click dalle impostazioni.",
  },
  {
    q: "Rimango io a controllare cosa viene inviato?",
    a: "Sì, 3 modalità a tua scelta dalle preferenze: Off (nessun invio), Hybrid (ti chiede ok prima di ogni candidatura), Auto (parte da solo sopra una soglia di match che decidi tu). Cambio in un click, sempre reversibile.",
  },
  {
    q: "Funziona davvero sui portali grossi?",
    a: "Sì sui form ATS pubblici di Greenhouse, Lever, Ashby, SmartRecruiters e Workable — gli stessi che useresti tu cliccando Apply. Per LinkedIn/Indeed pesca gli annunci e poi li reindirizza al form ATS sottostante. Mai chiediamo né conserviamo le tue credenziali di LinkedIn/Indeed.",
  },
  {
    q: "Le candidature saranno generiche o standard?",
    a: "Ogni candidatura ha CV e cover letter riscritti da Claude per quel singolo annuncio: il sistema legge il job description, individua keyword ATS, riformula le esperienze esistenti. Niente di inventato — solo il tuo materiale, riordinato per ogni offerta.",
  },
  {
    q: "Posso rivedere prima di inviare?",
    a: "Sì, in modalità Hybrid ricevi un riepilogo ogni candidatura prima dell'invio e clicchi 'Invia' o 'Salta'. In modalità Auto puoi comunque vedere tutto lo storico in dashboard e segnalare problemi sui singoli invii.",
  },
  {
    q: "Per chi è LavorAI?",
    a: "Per professionisti italiani che cercano lavoro tech, design, marketing, product o sales — in Italia, Europa o remoto. Funziona meglio se hai 1+ anno di esperienza e un CV in italiano o inglese. Non sostituisce il networking, ma toglie il lavoro ripetitivo dalle tue serate.",
  },
  {
    q: "Cosa succede dopo la registrazione?",
    a: "1) Verifichi l'email (60 secondi). 2) Carichi il CV — Claude estrae profilo, esperienze, ruoli. 3) Confermi 1-2 ruoli e città target. 4) LavorAI inizia a candidare 3 volte al giorno (mattina, pranzo, pomeriggio) sui job che matchano. Ricevi mail solo per recruiter che rispondono.",
  },
];

/**
 * Trust block items — claim di sicurezza per il blocco privacy.
 * Coerenti con /privacy ma non legalese.
 */
export const TRUST_CLAIMS: Array<{
  icon: "shield" | "lock" | "trash" | "download" | "eye" | "check";
  title: string;
  body: string;
}> = [
  {
    icon: "shield",
    title: "Server europei, GDPR-first",
    body: "Il CV vive su Neon · Frankfurt. Niente storage USA, niente trasferimenti opaqui. Conforme al Reg. UE 2016/679.",
  },
  {
    icon: "lock",
    title: "Cifratura in transito e a riposo",
    body: "TLS 1.3 sul trasporto, AES-256 sui dati sensibili. Solo il worker che genera CV ha accesso al testo in chiaro, e solo per la durata della richiesta.",
  },
  {
    icon: "check",
    title: "Consenso esplicito per ogni portale",
    body: "L'auto-apply sui portali si attiva solo dopo che lo abiliti dalle preferenze. Niente submit silenti, niente default opt-in.",
  },
  {
    icon: "eye",
    title: "Controllo totale, sempre",
    body: "Pausa quando vuoi, blacklist aziende, soglie di match. Dashboard live di ogni candidatura inviata e visualizzata.",
  },
  {
    icon: "download",
    title: "Export integrale, 1 click",
    body: "JSON completo di profilo + CV + storico candidature scaricabile da impostazioni. Nessuna richiesta, nessuna attesa.",
  },
  {
    icon: "trash",
    title: "Cancellazione completa, 1 click",
    body: "Rimuove utente, CV, file, code, candidature aperte. Backup ruotano in 30 giorni come da norma GDPR.",
  },
];

/**
 * "Per chi è" target personas. Ognuna ha 1 hero use case.
 * Usato per SEO + qualifica visitor "questo è per me?"
 */
export const PERSONAS: Array<{
  title: string;
  body: string;
}> = [
  {
    title: "Professionista mid/senior in cerca di una svolta",
    body: "Hai 3-10 anni di esperienza, conosci il tuo valore, ma le serate a copincollare il CV ti stanno spegnendo. LavorAI fa quel lavoro al posto tuo, mentre tu fai colloqui veri.",
  },
  {
    title: "Junior o neolaureato che vuole farsi notare",
    body: "Il CV generico non sblocca i recruiter. Ogni cover letter taylored aumenta la chance di una risposta. LavorAI le scrive una per una, citando l'annuncio.",
  },
  {
    title: "Italiano che cerca lavoro all'estero",
    body: "Cover letter in inglese nativo (o italiano se il JD è in italiano). Pesca da Greenhouse/Lever EU. Filtra solo lavori che accettano sponsor o EU-authorized.",
  },
  {
    title: "Freelance / P.IVA che cerca progetti",
    body: "Modalità P.IVA: la cover letter diventa un pitch B2B con tariffa giornaliera, disponibilità, portfolio. Non un CV da dipendente.",
  },
];

/**
 * "Perché non ChatGPT" — block che differenzia da generic AI assistant.
 */
export const WHY_NOT_CHATGPT: Array<{
  title: string;
  body: string;
}> = [
  {
    title: "ChatGPT scrive. LavorAI esegue.",
    body: "Con ChatGPT scrivi il prompt, copi il CV, leggi l'output, copi nel form ATS, cambi un dato, ti accorgi che hai sbagliato la posizione, ricominci. Per ogni annuncio. LavorAI fa tutto il giro al posto tuo: legge il JD, riscrive, compila il form, invia.",
  },
  {
    title: "Non scopre i lavori per te.",
    body: "ChatGPT non legge LinkedIn, Greenhouse, Lever o le job board EU. LavorAI scrape attiva ~5.000 aziende ATS ogni 2 ore, filtra per i tuoi ruoli, e ti mostra solo i match.",
  },
  {
    title: "Niente memoria del tuo profilo.",
    body: "Ogni conversazione ChatGPT riparte da zero. LavorAI conserva il tuo profilo CV strutturato (esperienze, skill, link), risposte ATS standard (visa, salary, EEO), preferenze. Ogni candidatura usa lo stesso profilo verificato.",
  },
  {
    title: "Niente automation reale.",
    body: "ChatGPT non clicca Apply. Non ricorda dove ha già candidato. Non sa quale recruiter ha risposto. LavorAI sì: dashboard live, contatore views, integrazione con la tua email per detection delle risposte.",
  },
];

/**
 * 5 step della post-signup experience — quello che l'utente vedrà nelle
 * prime 24h dopo la registrazione. Mostrato sia su signup ("what
 * happens next") sia in landing nella sezione "Cosa succede dopo".
 */
export const POST_SIGNUP_STEPS: Array<{
  duration: string;
  title: string;
  body: string;
}> = [
  {
    duration: "60s",
    title: "Verifica email",
    body: "Link sicuro nella tua casella. Scade in 24h, mai conservato.",
  },
  {
    duration: "2 min",
    title: "Carica il CV",
    body: "PDF o DOCX. Claude estrae profilo, esperienze, link.",
  },
  {
    duration: "1 min",
    title: "Conferma ruoli e città",
    body: "1-2 ruoli, 1-2 sedi. Modificabili sempre dalle preferenze.",
  },
  {
    duration: "≤ 4h",
    title: "Prima candidatura",
    body: "Parte alla prossima finestra tattica (09:00 / 13:00 / 17:00).",
  },
  {
    duration: "2-3gg",
    title: "Prime risposte",
    body: "Recruiter clicca il portfolio dal cover letter → notifica viste in dashboard.",
  },
];
