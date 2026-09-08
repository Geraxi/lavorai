/**
 * Guide SEO — contenuti long-form in italiano per query informative e
 * commerciali a coda lunga ("CV ATS", "lettera di presentazione esempio",
 * "quante candidature per trovare lavoro", "software candidature automatiche").
 *
 * Ogni guida rende: Article + BreadcrumbList + FAQPage in JSON-LD, link
 * interni alle guide correlate e CTA al prodotto. Le date sono fisse (non
 * `new Date()`) così `lastModified` in sitemap è stabile e credibile.
 *
 * Per aggiungere una guida: nuovo oggetto in GUIDES, poi verrà inclusa in
 * automatico in sitemap, indice /guide e link "correlati".
 */

export type GuideSection = {
  h2: string;
  paragraphs?: string[];
  list?: string[];
  /** Blocco evidenziato (esempio, template, formula). Righe separate da \n. */
  example?: { title: string; body: string };
};

export type Guide = {
  slug: string;
  /** H1 e og:title */
  title: string;
  /** <title> (≤ 60 caratteri, keyword all'inizio) */
  metaTitle: string;
  /** meta description (≤ 155 caratteri) */
  description: string;
  keywords: string[];
  published: string; // ISO date
  updated: string; // ISO date
  category: "CV" | "Candidature" | "Colloquio" | "Strumenti";
  intro: string[];
  sections: GuideSection[];
  faq: { q: string; a: string }[];
  related: string[];
  cta: { title: string; body: string; label: string; href: string };
};

const CTA_AUTO = {
  title: "Stanco di compilare form?",
  body: "LavorAI riscrive il CV per ogni annuncio e invia le candidature al posto tuo su Greenhouse, Lever, Ashby e Workable. 3 candidature gratis, senza carta.",
  label: "Prova 3 candidature gratis",
  href: "/signup",
};

const CTA_CV = {
  title: "Vuoi sapere se il tuo CV passa gli ATS?",
  body: "Carica il CV e ricevi in 30 secondi il punteggio ATS, le keyword mancanti e i suggerimenti concreti. Gratis, senza registrazione.",
  label: "Analizza il CV gratis",
  href: "/analizza-cv",
};

const CTA_INTERVIEW = {
  title: "Allenati prima del colloquio vero",
  body: "Interview Buddy simula il colloquio per il ruolo che vuoi, ti fa le domande e valuta le risposte. Gratis.",
  label: "Simula un colloquio",
  href: "/interview-buddy",
};

export const GUIDES: Guide[] = [
  {
    slug: "cv-ats-friendly",
    title: "CV ATS friendly: come scriverlo nel 2026 (con esempio)",
    metaTitle: "CV ATS friendly: guida 2026 con esempio",
    description:
      "Il 75% dei CV viene scartato da un software prima che un recruiter lo legga. Formato, keyword, struttura: come rendere il CV ATS friendly, con esempio pronto.",
    keywords: ["cv ats friendly", "cv ats", "curriculum ats", "cv formato ats", "applicant tracking system cv"],
    published: "2026-09-08",
    updated: "2026-09-08",
    category: "CV",
    intro: [
      "Un ATS (Applicant Tracking System) è il software che le aziende usano per raccogliere e filtrare le candidature. Greenhouse, Lever, Workday, SmartRecruiters, Ashby: quasi tutte le aziende con più di 50 dipendenti ne usano uno. Prima che un essere umano apra il tuo CV, l'ATS lo ha già letto, trasformato in testo e confrontato con l'annuncio.",
      "Se il CV non è leggibile dal software, o non contiene le parole che il recruiter ha inserito nel filtro, viene archiviato senza che nessuno lo veda. Non è una leggenda: è il funzionamento normale di questi strumenti. La buona notizia è che rendere un CV ATS friendly richiede regole semplici e verificabili.",
    ],
    sections: [
      {
        h2: "Come legge il CV un ATS",
        paragraphs: [
          "L'ATS esegue un parsing: estrae il testo dal PDF o dal DOCX e cerca di riconoscere le sezioni (esperienze, formazione, competenze) e i campi (azienda, ruolo, date). Poi il recruiter applica filtri o una ricerca per parole chiave, oppure il sistema calcola una percentuale di corrispondenza con l'annuncio.",
          "Tutto ciò che il parser non riesce a leggere sparisce. Colonne affiancate, tabelle, icone, testo dentro immagini, intestazioni e piè di pagina: sono le cause più comuni di CV che risultano vuoti o incompleti nel sistema.",
        ],
      },
      {
        h2: "Le 8 regole di un CV ATS friendly",
        list: [
          "Una sola colonna. Le impaginazioni a due colonne vengono lette in ordine casuale e mischiano esperienze e competenze.",
          "Titoli di sezione standard: \"Esperienza professionale\", \"Formazione\", \"Competenze\". Evita titoli creativi come \"Il mio percorso\".",
          "Font di sistema (Arial, Calibri, Helvetica, Georgia) tra 10 e 12 punti. Niente font decorativi.",
          "Niente tabelle, caselle di testo, icone, grafici a barre delle competenze. Usa testo semplice ed elenchi puntati.",
          "Date in formato coerente, per esempio \"Gen 2023 – Mag 2025\". Il parser usa le date per calcolare gli anni di esperienza.",
          "Salva in PDF (testo selezionabile) o DOCX. Mai immagine, mai PDF scansionato.",
          "Nome del file pulito: \"Nome-Cognome-CV.pdf\". Alcuni sistemi lo mostrano al recruiter.",
          "Le informazioni di contatto vanno nel corpo del documento, non nell'intestazione: molti parser ignorano header e footer.",
        ],
      },
      {
        h2: "Le keyword: il vero filtro",
        paragraphs: [
          "Il formato fa passare il CV al parser. Le parole chiave lo fanno arrivare al recruiter. Il metodo è sempre lo stesso: apri l'annuncio, evidenzia competenze, strumenti, titoli di ruolo e certificazioni citati, e assicurati che compaiano nel CV con la stessa formulazione.",
          "Se l'annuncio dice \"gestione stakeholder\" e tu hai scritto \"rapporti con i clienti interni\", per il filtro sono due cose diverse. Usa la formulazione dell'annuncio, senza inventare competenze che non hai. Includi sia la sigla sia il nome esteso quando esistono entrambi: \"SEO (Search Engine Optimization)\", \"CRM\", \"Customer Relationship Management\".",
          "Questo significa che un CV ATS friendly non è un documento unico: è un documento base che adatti a ogni annuncio. È l'attività che porta via più tempo, ed è esattamente quella che vale la pena automatizzare.",
        ],
      },
      {
        h2: "Esempio di struttura ATS friendly",
        example: {
          title: "Struttura consigliata",
          body: "MARIA ROSSI\nMilano · maria.rossi@email.it · +39 333 0000000 · linkedin.com/in/mariarossi\n\nPROFILO\nProduct Manager con 5 anni di esperienza in SaaS B2B. Ho guidato il lancio di 3 prodotti con oltre 40.000 utenti attivi.\n\nESPERIENZA PROFESSIONALE\nProduct Manager · Acme Srl · Milano · Mar 2022 – oggi\n- Definito la roadmap di 2 prodotti, aumentando la retention del 18% in 12 mesi\n- Coordinato un team di 6 tra sviluppatori e designer con metodologia Scrum\n\nFORMAZIONE\nLaurea magistrale in Ingegneria Gestionale · Politecnico di Milano · 2019\n\nCOMPETENZE\nProduct discovery, Jira, SQL, Figma, A/B testing, Scrum, inglese C1",
        },
      },
      {
        h2: "Gli errori che scartano più CV",
        list: [
          "Il CV \"grafico\" fatto su Canva: bello per un umano, illeggibile per il parser.",
          "Competenze espresse con pallini o percentuali invece che con parole.",
          "Un solo CV generico inviato a 100 annunci diversi.",
          "Foto e dati personali non richiesti (stato civile, data di nascita): in molti ATS internazionali vengono rimossi o penalizzati.",
          "Buchi temporali non spiegati: il sistema li segnala al recruiter.",
        ],
      },
    ],
    faq: [
      {
        q: "Il formato europeo Europass è ATS friendly?",
        a: "In parte. L'Europass ha un layout a due colonne e molte etichette fisse che i parser leggono male. Meglio un CV a una colonna con titoli standard, salvo che l'annuncio richieda esplicitamente il formato Europass.",
      },
      {
        q: "PDF o Word per gli ATS?",
        a: "PDF con testo selezionabile è sicuro con tutti i sistemi moderni. DOCX è accettato ovunque ma può cambiare impaginazione. Evita PDF generati da scansioni o immagini.",
      },
      {
        q: "Quanto deve essere lungo un CV ATS friendly?",
        a: "Una pagina fino a 5 anni di esperienza, due pagine oltre. La lunghezza non penalizza il parser, ma penalizza il recruiter che ha 7 secondi per decidere.",
      },
      {
        q: "Come faccio a sapere se il mio CV passa gli ATS?",
        a: "Copia il testo del PDF in un editor di testo semplice: se le informazioni sono in ordine e complete, il parser le leggerà. Oppure usa uno strumento di analisi ATS che calcola il punteggio rispetto a un annuncio specifico.",
      },
    ],
    related: ["cv-in-inglese", "lettera-di-presentazione-esempio", "software-candidature-automatiche"],
    cta: CTA_CV,
  },
  {
    slug: "lettera-di-presentazione-esempio",
    title: "Lettera di presentazione: esempi e struttura che funzionano nel 2026",
    metaTitle: "Lettera di presentazione: esempi e struttura 2026",
    description:
      "Come scrivere una lettera di presentazione che venga letta: struttura in 4 paragrafi, 2 esempi completi (junior e senior), errori da evitare e quando non serve.",
    keywords: ["lettera di presentazione esempio", "lettera di presentazione", "cover letter italiano", "lettera motivazionale lavoro", "come scrivere una lettera di presentazione"],
    published: "2026-09-08",
    updated: "2026-09-08",
    category: "Candidature",
    intro: [
      "La lettera di presentazione è il testo che accompagna il CV e spiega perché ti candidi a quella posizione, in quell'azienda. La maggior parte dei recruiter la legge solo quando il CV li ha già convinti, e la usa per una domanda precisa: questa persona ha capito cosa cerchiamo?",
      "Per questo la lettera generica (\"sono una persona dinamica e motivata\") non serve a niente. Una lettera efficace è corta, parla dell'azienda prima che di te e collega uno o due risultati concreti al problema che il ruolo deve risolvere.",
    ],
    sections: [
      {
        h2: "La struttura in 4 paragrafi",
        list: [
          "Apertura (2 righe): il ruolo per cui ti candidi e il motivo specifico per cui l'azienda ti interessa. Niente \"con la presente\".",
          "Il tuo valore (4-5 righe): uno o due risultati misurabili della tua esperienza che rispondono direttamente ai requisiti dell'annuncio.",
          "Perché tu, perché ora (3 righe): cosa sai dell'azienda o del prodotto e come ci vedi il tuo contributo nei primi mesi.",
          "Chiusura (2 righe): disponibilità per un colloquio e ringraziamento. Firma con nome, telefono, LinkedIn.",
        ],
        paragraphs: ["Lunghezza totale: tra 150 e 250 parole. Se supera mezza pagina, taglia."],
      },
      {
        h2: "Esempio 1: profilo junior (neolaureata, marketing)",
        example: {
          title: "Lettera per Marketing Specialist junior",
          body: "Gentile team Marketing di Brava,\n\nmi candido per la posizione di Marketing Specialist junior. Seguo Brava da quando avete lanciato la newsletter settimanale: è uno dei pochi contenuti B2B che leggo fino in fondo.\n\nDurante il tirocinio in Agenzia Nord ho gestito il calendario editoriale LinkedIn di 3 clienti, portando l'engagement medio dal 1,2% al 3,4% in quattro mesi. Ho lavorato con HubSpot per l'automazione delle email e con Google Analytics 4 per il reporting, gli stessi strumenti citati nel vostro annuncio.\n\nMi interessa in particolare il vostro obiettivo di crescere sul mercato tedesco: ho un livello di tedesco C1 e ho vissuto un anno a Berlino.\n\nSarei felice di raccontarvi di più in un colloquio. Grazie per il tempo dedicato.\n\nGiulia Bianchi · 333 0000000 · linkedin.com/in/giuliabianchi",
        },
      },
      {
        h2: "Esempio 2: profilo senior (cambio di settore)",
        example: {
          title: "Lettera per Operations Manager, da retail a logistica",
          body: "Gentile Marco Verdi,\n\nmi candido come Operations Manager per il vostro hub di Bologna. Dopo otto anni nella gestione di punti vendita per una catena con 120 negozi, cerco un contesto dove l'ottimizzazione dei processi sia il cuore del lavoro, non un'attività collaterale.\n\nNegli ultimi tre anni ho coordinato 45 persone su 6 sedi, ridotto il costo del personale del 9% riorganizzando i turni e portato l'accuratezza dell'inventario dal 94% al 99,2% introducendo controlli ciclici. Sono gli stessi indicatori che il vostro annuncio mette al primo posto.\n\nSo che state integrando un nuovo WMS: ho guidato una migrazione simile nel 2024, con go-live senza interruzioni di servizio.\n\nSono disponibile per un confronto quando preferite.\n\nLuca Neri · 333 0000000",
        },
      },
      {
        h2: "Errori che fanno chiudere la lettera",
        list: [
          "Ripetere il CV in forma di prosa. La lettera aggiunge contesto, non elenca esperienze.",
          "Aggettivi al posto dei fatti: \"proattivo\", \"orientato ai risultati\", \"problem solver\".",
          "Iniziare con \"Con la presente\" o \"Alla cortese attenzione\". È il segnale immediato di una lettera standard.",
          "Non nominare l'azienda o sbagliarne il nome (succede quando si riusa il testo).",
          "Parlare di ciò che vuoi ottenere tu (\"cerco una crescita professionale\") invece di ciò che puoi dare.",
        ],
      },
      {
        h2: "Quando la lettera non serve (e quando è decisiva)",
        paragraphs: [
          "Sui form ATS il campo è spesso facoltativo e in molte aziende tech nessuno lo legge. Nelle candidature spontanee, nei ruoli che richiedono scrittura (marketing, comunicazione, vendite) e nei cambi di settore la lettera è invece il documento che spiega ciò che il CV da solo non dice.",
          "Regola pratica: se il campo esiste, compilalo con una lettera adattata all'annuncio. Un testo generico è peggio di nessun testo, perché comunica poca cura. Se ti candidi a decine di posizioni, è il punto in cui uno strumento AI che riscrive la lettera sull'annuncio fa la differenza tra farla bene e non farla.",
        ],
      },
    ],
    faq: [
      {
        q: "Quanto deve essere lunga una lettera di presentazione?",
        a: "Tra 150 e 250 parole, mai oltre mezza pagina. Il recruiter decide in meno di un minuto se continuare a leggere.",
      },
      {
        q: "Lettera di presentazione e lettera motivazionale sono la stessa cosa?",
        a: "In Italia i due termini sono usati come sinonimi per le candidature di lavoro. \"Lettera motivazionale\" è più frequente per master, borse di studio e programmi di selezione.",
      },
      {
        q: "Devo allegarla come PDF o scriverla nel corpo dell'email?",
        a: "Se ti candidi via email, scrivi la lettera nel corpo del messaggio e allega solo il CV. Se c'è un form con campo dedicato, incollala lì. Se il form accetta solo allegati, PDF a parte con nome chiaro.",
      },
    ],
    related: ["candidatura-spontanea-email", "cv-ats-friendly", "quante-candidature-per-trovare-lavoro"],
    cta: CTA_AUTO,
  },
  {
    slug: "candidatura-spontanea-email",
    title: "Candidatura spontanea via email: esempio, oggetto e modello da copiare",
    metaTitle: "Candidatura spontanea email: esempio e modello",
    description:
      "Come scrivere un'email di candidatura spontanea che riceva risposta: a chi mandarla, oggetto, struttura, esempio completo e follow-up dopo 7 giorni.",
    keywords: ["candidatura spontanea email", "candidatura spontanea esempio", "email candidatura spontanea", "come scrivere una candidatura spontanea", "oggetto email candidatura"],
    published: "2026-09-08",
    updated: "2026-09-08",
    category: "Candidature",
    intro: [
      "La candidatura spontanea è una proposta che invii a un'azienda senza che ci sia un annuncio aperto. Funziona meglio di quanto si pensi, per una ragione semplice: molte posizioni vengono coperte prima di essere pubblicate, e chi arriva quando il bisogno esiste ma l'annuncio non c'è ancora ha pochissima concorrenza.",
      "Il tasso di risposta dipende quasi solo da due cose: a chi la mandi e quanto è specifica. Un'email a \"info@\" con CV generico ha un tasso di risposta vicino a zero. Un'email al responsabile dell'area, con una proposta concreta, riceve risposta in circa un caso su quattro.",
    ],
    sections: [
      {
        h2: "A chi inviarla",
        paragraphs: [
          "Non alle risorse umane, se puoi evitarlo, e mai a indirizzi generici. Cerca su LinkedIn il responsabile dell'area in cui vorresti lavorare (Head of Marketing, Responsabile produzione, CTO, Store manager) e scrivi a lui o a lei. Il formato email aziendale si ricava quasi sempre da quello di un altro dipendente trovato online.",
          "Nelle aziende piccole scrivi direttamente al titolare. Nelle grandi aziende con ATS, oltre all'email carica il CV nella sezione \"candidatura spontanea\" del sito carriere: molte la usano davvero come bacino per le ricerche interne.",
        ],
      },
      {
        h2: "L'oggetto dell'email",
        paragraphs: [
          "L'oggetto decide se l'email viene aperta. Deve dire chi sei e cosa proponi, in meno di 60 caratteri. Evita \"Candidatura spontanea\" da solo: è il messaggio che tutti aprono per ultimo.",
        ],
        list: [
          "\"Sviluppatrice backend Python, 4 anni: disponibile da ottobre\"",
          "\"Proposta: ridurre i resi del vostro e-commerce (ho i numeri)\"",
          "\"Candidatura spontanea: Export Manager mercato DACH\"",
        ],
      },
      {
        h2: "Esempio completo",
        example: {
          title: "Email di candidatura spontanea (ruolo: e-commerce manager)",
          body: "Oggetto: E-commerce manager con 6 anni su Shopify: posso aiutarvi sul mercato tedesco?\n\nBuongiorno Laura,\n\nseguo Fabbrica Verde da un paio d'anni e ho notato che avete appena aperto lo shop in tedesco. Ho gestito esattamente questa fase per un brand italiano di arredamento: in 14 mesi il mercato DACH è passato dal 4% al 27% del fatturato online.\n\nSo che non avete una posizione aperta. Vi scrivo perché credo di poter accorciare i tempi su tre cose: localizzazione del catalogo, logistica dei resi e campagne Google Shopping in tedesco.\n\nAllego il CV. Se vi interessa, sono disponibile per una chiamata di 20 minuti la settimana prossima, anche solo per confrontarci.\n\nGrazie per l'attenzione,\nAndrea Conti\n333 0000000 · linkedin.com/in/andreaconti",
        },
      },
      {
        h2: "Il follow-up",
        paragraphs: [
          "Se non ricevi risposta, scrivi di nuovo dopo 7 giorni, nello stesso thread, con due righe: \"Buongiorno Laura, riprendo la mia email della scorsa settimana nel caso fosse passata inosservata. Resto disponibile.\" Un solo follow-up, mai due. Quasi metà delle risposte a una candidatura spontanea arriva dopo il promemoria.",
        ],
      },
      {
        h2: "Allegati e dettagli che contano",
        list: [
          "Un solo allegato: il CV in PDF, massimo 2 pagine, nome file \"Nome-Cognome-CV.pdf\".",
          "Niente lettera di presentazione allegata: la lettera è l'email stessa.",
          "Firma con telefono e LinkedIn, così la persona può controllarti in 10 secondi.",
          "Invia tra martedì e giovedì, tra le 8 e le 10 del mattino.",
          "Tieni traccia di ogni invio (azienda, persona, data, follow-up) in un foglio o in una dashboard: dopo 20 email non ricordi più nulla.",
        ],
      },
    ],
    faq: [
      {
        q: "La candidatura spontanea funziona davvero?",
        a: "Sì, soprattutto nelle PMI e nelle aziende in crescita. Il tasso di risposta di un'email mirata al responsabile di area è intorno al 20-30%, contro meno del 5% di un annuncio pubblico con centinaia di candidati.",
      },
      {
        q: "Meglio email o LinkedIn?",
        a: "L'email è più formale e resta negli archivi. LinkedIn funziona per un primo contatto breve, seguito da email con CV. Se non trovi l'indirizzo, un messaggio LinkedIn di 4 righe è comunque meglio di niente.",
      },
      {
        q: "Cosa scrivo se non ho esperienza?",
        a: "Proponi qualcosa di concreto e a basso rischio per l'azienda: uno stage, un periodo di prova, un progetto. Mostra di conoscere il loro prodotto e cita un risultato, anche universitario o personale, che dimostri le competenze richieste.",
      },
    ],
    related: ["lettera-di-presentazione-esempio", "come-candidarsi-su-linkedin", "quante-candidature-per-trovare-lavoro"],
    cta: CTA_AUTO,
  },
  {
    slug: "quante-candidature-per-trovare-lavoro",
    title: "Quante candidature servono per trovare lavoro? I numeri reali",
    metaTitle: "Quante candidature servono per trovare lavoro",
    description:
      "In media servono 100-200 candidature per un'offerta. Tassi di risposta per settore, quanto tempo richiede e come ridurre lo sforzo senza ridurre la qualità.",
    keywords: ["quante candidature per trovare lavoro", "quante candidature al giorno", "tasso di risposta candidature", "quanto tempo per trovare lavoro", "nessuna risposta alle candidature"],
    published: "2026-09-08",
    updated: "2026-09-08",
    category: "Candidature",
    intro: [
      "Chi cerca lavoro attivamente si fa quasi sempre la stessa domanda dopo le prime settimane senza risposta: è normale? La risposta è sì, e i numeri lo confermano. Il processo di selezione è un imbuto molto stretto, e il silenzio è la risposta più frequente a ogni livello.",
      "Questa guida mette insieme i dati disponibili sulle percentuali di risposta e li traduce in un piano settimanale realistico. Non per scoraggiare, ma per calibrare l'aspettativa e organizzare il tempo.",
    ],
    sections: [
      {
        h2: "L'imbuto delle candidature",
        paragraphs: [
          "I dati aggregati delle piattaforme di recruiting e le rilevazioni sui candidati raccontano un imbuto simile in tutti i mercati occidentali. Su 100 candidature online a posizioni pubbliche:",
        ],
        list: [
          "Circa 10-20 ricevono una risposta di qualsiasi tipo (anche un rifiuto).",
          "Circa 5-10 portano a un primo colloquio telefonico o video.",
          "Circa 2-4 arrivano a un colloquio tecnico o con il responsabile.",
          "1 (a volte 2) si conclude con un'offerta.",
        ],
      },
      {
        h2: "Quindi quante candidature servono?",
        paragraphs: [
          "Con questi tassi, per ricevere un'offerta servono in media tra 100 e 200 candidature, e tra 2 e 5 mesi di ricerca attiva. I profili molto richiesti (sviluppatori senior, infermieri, alcune figure tecniche) stanno sotto le 50; chi cambia settore, i profili junior senza esperienza e i ruoli da manager stanno spesso sopra le 200.",
          "Il numero però cambia moltissimo in base alla qualità di ogni candidatura. Un CV adattato all'annuncio ha un tasso di risposta 2-3 volte più alto di un CV generico inviato a raffica. Questo è il vero compromesso: più candidature curate, non più candidature e basta.",
        ],
      },
      {
        h2: "Quante candidature al giorno o a settimana",
        paragraphs: [
          "Un ritmo sostenibile per una ricerca a tempo pieno è di 10-15 candidature curate a settimana, ovvero 2-3 al giorno. Se lavori già e cerchi in parallelo, 5 a settimana. Sotto questa soglia i tempi si allungano oltre i 6 mesi; sopra le 5 al giorno la qualità crolla, a meno che l'adattamento del CV e della lettera non sia automatizzato.",
          "Ogni candidatura fatta bene richiede 30-45 minuti: leggere l'annuncio, adattare il CV, scrivere la lettera, compilare il form. È da qui che nasce il senso di sfinimento: 15 candidature a settimana sono 10 ore di lavoro ripetitivo.",
        ],
      },
      {
        h2: "Come aumentare il tasso di risposta",
        list: [
          "Candidati nelle prime 48 ore dalla pubblicazione: le prime candidature vengono lette per davvero, le ultime spesso no.",
          "Adatta CV e lettera alle keyword dell'annuncio (vedi la guida sul CV ATS friendly).",
          "Punta agli annunci dove soddisfi almeno il 60% dei requisiti: sotto è tempo perso, sopra il 90% probabilmente sei sovraqualificato.",
          "Affianca alle candidature online 2-3 contatti diretti a settimana (candidature spontanee, referral, messaggi a chi lavora nell'azienda).",
          "Traccia tutto: senza un registro non sai quali tipi di annuncio ti rispondono e non puoi fare follow-up.",
        ],
      },
      {
        h2: "Quando preoccuparsi",
        paragraphs: [
          "Zero risposte su 30 candidature curate è un segnale: quasi sempre il problema è il CV (non passa i filtri o non comunica il valore nei primi 7 secondi), oppure il posizionamento (ruoli troppo alti, troppo bassi o in un settore in cui il tuo profilo non è leggibile). Prima di aumentare il volume, fai analizzare il CV e verifica che la formulazione dei tuoi ruoli corrisponda a quella usata negli annunci.",
        ],
      },
    ],
    faq: [
      {
        q: "Quanto tempo ci vuole in media per trovare lavoro?",
        a: "Tra 2 e 5 mesi di ricerca attiva per un profilo con esperienza, più a lungo per neolaureati e cambi di settore. Il tempo si riduce con candidature mirate e contatti diretti.",
      },
      {
        q: "È normale non ricevere nessuna risposta?",
        a: "Sì. L'80-90% delle candidature online non riceve alcuna risposta, nemmeno un rifiuto. Non è un giudizio sul candidato ma il funzionamento del sistema.",
      },
      {
        q: "Meglio 5 candidature al giorno o 5 a settimana?",
        a: "Dipende da quanto sono curate. Cinque candidature adattate all'annuncio a settimana battono cinque candidature generiche al giorno. Se riesci ad automatizzare l'adattamento, il volume torna ad essere un vantaggio.",
      },
    ],
    related: ["cv-ats-friendly", "candidatura-spontanea-email", "software-candidature-automatiche"],
    cta: CTA_AUTO,
  },
  {
    slug: "come-candidarsi-su-linkedin",
    title: "Come candidarsi su LinkedIn nel 2026 (e perché Easy Apply non basta)",
    metaTitle: "Come candidarsi su LinkedIn: guida pratica 2026",
    description:
      "Candidatura semplice vs form esterno, profilo che passa i filtri dei recruiter, messaggio al responsabile, alert efficaci. Guida pratica per candidarsi su LinkedIn con risultati.",
    keywords: ["come candidarsi su linkedin", "candidatura semplice linkedin", "linkedin easy apply", "cercare lavoro su linkedin", "candidarsi linkedin senza cv"],
    published: "2026-09-08",
    updated: "2026-09-08",
    category: "Candidature",
    intro: [
      "LinkedIn è il canale su cui passa la maggior parte delle offerte per profili impiegatizi e professionali in Italia. Ma la funzione più usata, la candidatura semplice, è anche quella con il tasso di risposta più basso: un clic per candidarsi significa centinaia di candidature per annuncio in poche ore.",
      "Questa guida spiega come usare LinkedIn in modo che le candidature vengano lette: quale tipo di candidatura scegliere, come preparare il profilo, come contattare chi assume.",
    ],
    sections: [
      {
        h2: "Candidatura semplice o form esterno?",
        paragraphs: [
          "Gli annunci su LinkedIn sono di due tipi. Con la candidatura semplice (Easy Apply) invii profilo e CV dentro LinkedIn: veloce, ma il recruiter riceve un elenco piatto di centinaia di profili e spesso ne guarda i primi 30. Con il pulsante \"Candidati\" vieni invece portato sul sito dell'azienda, quasi sempre un ATS (Greenhouse, Lever, Workday, SmartRecruiters), dove compili un form completo.",
          "Il form esterno richiede 10-15 minuti e per questo ha molta meno concorrenza. Le candidature che arrivano dall'ATS aziendale vengono gestite dal team interno con più attenzione. Regola pratica: se l'annuncio ti interessa davvero, preferisci sempre il form esterno, anche quando esiste la candidatura semplice.",
        ],
      },
      {
        h2: "Il profilo viene letto prima del CV",
        paragraphs: [
          "Su LinkedIn i recruiter cercano attivamente con LinkedIn Recruiter, filtrando per titolo, competenze, località e anni di esperienza. Il tuo profilo deve rispondere a quei filtri.",
        ],
        list: [
          "Titolo (headline): il ruolo che cerchi con le parole usate negli annunci, non una frase creativa. \"Data Analyst | SQL, Power BI, Python\" batte \"Appassionato di numeri\".",
          "Sezione Competenze: inserisci almeno 15-20 competenze, con in cima quelle citate negli annunci a cui ti candidi.",
          "Esperienze con descrizioni: 2-3 righe con risultati misurabili per ogni ruolo, come nel CV.",
          "Attiva \"Open to work\" visibile solo ai recruiter, se lavori già. Inserisci ruoli e sedi desiderati: alimenta i suggerimenti che ricevi.",
          "Località: metti la città dove vuoi lavorare, non quella di residenza, se sono diverse.",
        ],
      },
      {
        h2: "Il messaggio a chi assume",
        paragraphs: [
          "Molti annunci mostrano il nome del recruiter o del responsabile che ha pubblicato l'offerta. Dopo esserti candidato, invia un messaggio breve (anche con richiesta di collegamento): chi sei, che ti sei candidato, un motivo specifico per cui sei adatto. Quattro righe. Questo gesto, che fanno pochissimi candidati, sposta la tua candidatura dalla pila anonima a un nome con un volto.",
        ],
        example: {
          title: "Messaggio dopo la candidatura",
          body: "Buongiorno Sara, mi sono appena candidato alla posizione di Account Manager. Ho gestito per 4 anni un portafoglio di clienti PMI nel vostro stesso settore, con rinnovi al 92%. Se può essere utile, sono disponibile per una breve chiamata. Grazie, Marco",
        },
      },
      {
        h2: "Alert e ricerca: come trovare gli annunci giusti",
        list: [
          "Crea 3-4 alert con titoli di ruolo diversi (in italiano e in inglese: \"Responsabile vendite\", \"Sales Manager\").",
          "Filtra per \"Ultime 24 ore\": le candidature nelle prime 48 ore hanno tasso di risposta molto più alto.",
          "Usa il filtro \"Meno di 10 candidati\" quando disponibile.",
          "Non fidarti dell'etichetta \"Promosso\": è pubblicità, non un segnale di qualità dell'annuncio.",
          "Controlla la data reale: molti annunci vengono ripubblicati per settimane.",
        ],
      },
      {
        h2: "Automatizzare senza farsi bloccare",
        paragraphs: [
          "LinkedIn vieta i bot che cliccano al posto tuo dentro la piattaforma e sospende gli account che li usano. Il modo sicuro di automatizzare è un altro: usare LinkedIn per scoprire gli annunci e far compilare in automatico i form esterni degli ATS, dove non serve il tuo account LinkedIn. È il funzionamento di strumenti come LavorAI, che non chiedono mai le credenziali LinkedIn.",
        ],
      },
    ],
    faq: [
      {
        q: "La candidatura semplice su LinkedIn funziona?",
        a: "Funziona per volume ma ha tassi di risposta bassi, spesso sotto il 3%, perché ogni annuncio riceve centinaia di candidature in poche ore. Per le posizioni che ti interessano usa il form esterno dell'azienda.",
      },
      {
        q: "Posso candidarmi su LinkedIn senza CV?",
        a: "Con la candidatura semplice sì, viene usato il profilo. È sconsigliato: il CV allegato permette al recruiter di valutarti in modo completo e viene richiesto in quasi tutti i processi successivi.",
      },
      {
        q: "È possibile automatizzare le candidature su LinkedIn?",
        a: "Non dentro LinkedIn: i bot violano i termini e portano alla sospensione dell'account. Si possono automatizzare i form esterni (Greenhouse, Lever, Ashby, Workable) a cui gli annunci LinkedIn rimandano.",
      },
    ],
    related: ["quante-candidature-per-trovare-lavoro", "software-candidature-automatiche", "cv-ats-friendly"],
    cta: CTA_AUTO,
  },
  {
    slug: "domande-colloquio-di-lavoro",
    title: "Le 20 domande più comuni al colloquio di lavoro e come rispondere",
    metaTitle: "Domande colloquio di lavoro: le 20 più comuni e risposte",
    description:
      "Parlami di te, punti deboli, perché vuoi lasciare il tuo lavoro, aspettative di stipendio: le 20 domande più frequenti al colloquio con il metodo per rispondere (STAR) ed esempi.",
    keywords: ["domande colloquio di lavoro", "domande colloquio e risposte", "domande frequenti colloquio", "come rispondere al colloquio", "metodo star colloquio"],
    published: "2026-09-08",
    updated: "2026-09-08",
    category: "Colloquio",
    intro: [
      "Le domande di un colloquio sono prevedibili molto più di quanto sembri. I recruiter e i responsabili ne usano un repertorio limitato, perché ognuna serve a verificare una cosa precisa: motivazione, competenza, modo di lavorare con gli altri, tenuta sotto pressione.",
      "Qui trovi le 20 più frequenti divise per obiettivo, con cosa vogliono davvero sapere e come impostare la risposta. Per le domande sull'esperienza il metodo di riferimento è STAR: Situazione, Task (compito), Azione, Risultato. Ogni risposta in 60-90 secondi.",
    ],
    sections: [
      {
        h2: "Domande di apertura e motivazione",
        list: [
          "Parlami di te. Non la biografia: 3 frasi su chi sei professionalmente, il risultato di cui vai più fiero, perché sei qui oggi.",
          "Perché vuoi lavorare da noi? Servono 2 elementi concreti sull'azienda (prodotto, mercato, un progetto recente) e il collegamento con quello che sai fare.",
          "Perché vuoi lasciare il tuo lavoro attuale? Mai parlare male del datore attuale. Parla di ciò che cerchi e che lì non c'è: responsabilità, settore, crescita.",
          "Cosa sai della nostra azienda? Verifica se hai fatto i compiti: sito, ultime notizie, LinkedIn dell'azienda, chi ti sta intervistando.",
          "Dove ti vedi tra 5 anni? Vogliono capire se il ruolo è coerente con la tua traiettoria. Rispondi con una direzione, non con un titolo.",
        ],
      },
      {
        h2: "Domande sull'esperienza (usa STAR)",
        list: [
          "Raccontami un progetto di cui sei orgoglioso. Situazione, obiettivo, cosa hai fatto tu (non il team), risultato con un numero.",
          "Descrivi una situazione difficile e come l'hai gestita. Scegli un caso con esito positivo o con una lezione chiara.",
          "Un errore che hai fatto e cosa hai imparato. L'errore deve essere vero e la lezione applicata dopo.",
          "Come gestisci le priorità quando tutto è urgente? Un metodo concreto (matrice, confronto con il capo, criteri) e un esempio.",
          "Raccontami un conflitto con un collega. Vogliono vedere maturità: descrivi il punto di vista dell'altro e come siete arrivati a una soluzione.",
        ],
        example: {
          title: "Esempio di risposta STAR",
          body: "Situazione: nel 2025 il nostro principale cliente minacciava di non rinnovare per ritardi nelle consegne.\nCompito: mi è stato chiesto di recuperare il rapporto in 60 giorni.\nAzione: ho mappato le 8 cause di ritardo, ne ho eliminate 5 rinegoziando i turni del magazzino e ho istituito una call settimanale con il cliente.\nRisultato: consegne puntuali al 97% in 6 settimane, contratto rinnovato per 2 anni con un aumento del 12%.",
        },
      },
      {
        h2: "Domande su punti di forza e debolezza",
        list: [
          "Qual è il tuo maggiore punto di forza? Uno solo, collegato al ruolo, con una prova.",
          "Qual è il tuo punto debole? Un difetto reale, non un pregio travestito (\"sono troppo perfezionista\"), e cosa fai per gestirlo.",
          "Come reagisci alle critiche? Un esempio in cui un feedback ti ha fatto cambiare qualcosa.",
          "Cosa direbbe di te il tuo ultimo capo? Due qualità e un'area di miglioramento, coerenti con il resto del colloquio.",
        ],
      },
      {
        h2: "Domande su stipendio e disponibilità",
        list: [
          "Quali sono le tue aspettative economiche? Dai una forbice informata (ricerca su Glassdoor, annunci simili, contratto nazionale) e chiedi il loro budget.",
          "Quanto guadagni ora? In Italia puoi non rispondere; meglio riportare la conversazione sulla forbice per il nuovo ruolo.",
          "Quando saresti disponibile? Il periodo di preavviso reale, senza promettere ciò che non puoi mantenere.",
          "Stai valutando altre offerte? Onestà senza dettagli: \"sono in altri processi, ma questo ruolo è tra le mie priorità\".",
        ],
      },
      {
        h2: "Le domande da fare tu",
        paragraphs: [
          "\"Hai domande per noi?\" chiude quasi ogni colloquio, e \"no\" è la risposta peggiore. Preparane tre: come misurano il successo nel ruolo nei primi 6 mesi, come è composto il team e con chi lavorerai, quali sono i prossimi passi del processo. Queste domande mostrano interesse e ti danno le informazioni per decidere.",
          "Il modo più efficace per prepararsi è provare a voce, non leggere. Una simulazione registrata o con uno strumento che ti fa le domande e valuta le risposte rivela le esitazioni che sulla carta non vedi.",
        ],
      },
    ],
    faq: [
      {
        q: "Cos'è il metodo STAR?",
        a: "Un modo per strutturare le risposte sull'esperienza: Situazione (contesto), Task (il tuo compito), Azione (cosa hai fatto tu), Risultato (l'esito, con numeri). Tiene la risposta concreta e sotto i 90 secondi.",
      },
      {
        q: "Quanto deve durare una risposta al colloquio?",
        a: "Tra 45 e 90 secondi. Sotto sembri impreparato, sopra perdi l'attenzione. Se la domanda è complessa, chiedi se vogliono un approfondimento dopo la risposta breve.",
      },
      {
        q: "Cosa rispondere a \"qual è il tuo punto debole\"?",
        a: "Un difetto vero e non critico per il ruolo, seguito da ciò che fai per gestirlo. Per esempio: \"Tendo a tenere troppo per me il lavoro; da un anno pianifico deleghe esplicite a inizio progetto.\"",
      },
    ],
    related: ["cv-ats-friendly", "quante-candidature-per-trovare-lavoro", "come-candidarsi-su-linkedin"],
    cta: CTA_INTERVIEW,
  },
  {
    slug: "cv-in-inglese",
    title: "CV in inglese: come scriverlo, differenze con quello italiano ed errori da evitare",
    metaTitle: "CV in inglese: guida, struttura ed errori da evitare",
    description:
      "Resume o CV, foto e dati personali, formule da non tradurre, verbi d'azione, esempio di struttura. Guida per scrivere un CV in inglese per aziende internazionali e remote.",
    keywords: ["cv in inglese", "curriculum in inglese", "come scrivere un cv in inglese", "resume vs cv", "cv inglese esempio"],
    published: "2026-09-08",
    updated: "2026-09-08",
    category: "CV",
    intro: [
      "Le posizioni remote e nelle aziende internazionali richiedono quasi sempre un CV in inglese, e sono anche quelle che passano per gli ATS più severi. Tradurre il CV italiano parola per parola produce un documento che un recruiter anglosassone riconosce subito come \"straniero\": troppo lungo, con foto e dati personali, pieno di formule che in inglese non esistono.",
      "Questa guida elenca le differenze che contano davvero e gli errori più comuni, con una struttura pronta da usare.",
    ],
    sections: [
      {
        h2: "Resume o CV?",
        paragraphs: [
          "Negli Stati Uniti e in Canada il documento si chiama resume: una pagina, sintetico, orientato ai risultati. \"CV\" indica il curriculum accademico completo, lungo anche 10 pagine. Nel Regno Unito, in Irlanda e in Europa si dice CV, ma il formato è quello del resume: 1-2 pagine. Per candidarti a un'azienda americana usa il termine resume e stai in una pagina.",
        ],
      },
      {
        h2: "Cosa togliere rispetto al CV italiano",
        list: [
          "La foto. Nei paesi anglosassoni è assente per evitare discriminazioni; molti ATS scartano automaticamente i CV con foto.",
          "Data di nascita, stato civile, nazionalità (salvo dove serve il permesso di lavoro), codice fiscale.",
          "La formula sull'autorizzazione al trattamento dei dati (GDPR): non esiste e non si traduce.",
          "\"Curriculum Vitae\" come titolo del documento: il titolo è il tuo nome.",
          "Le competenze linguistiche descritte in modo vago: usa i livelli CEFR (B2, C1) o \"native\", \"fluent\", \"professional working proficiency\".",
        ],
      },
      {
        h2: "Cosa aggiungere",
        list: [
          "Un Professional Summary di 2-3 righe in cima: ruolo, anni di esperienza, i 2 risultati più forti.",
          "Verbi d'azione al passato all'inizio di ogni punto: led, built, increased, reduced, launched, negotiated. Mai \"responsible for\".",
          "Numeri in ogni punto possibile: percentuali, euro, persone gestite, tempi ridotti.",
          "Le equivalenze dei titoli di studio: \"Laurea magistrale\" diventa \"Master's degree in\", \"Laurea triennale\" diventa \"Bachelor's degree in\", il voto in centodecimi si può omettere o spiegare (110/110).",
          "Le competenze tecniche in una sezione \"Skills\" con le stesse parole dell'annuncio.",
        ],
      },
      {
        h2: "Struttura consigliata",
        example: {
          title: "Resume a una pagina",
          body: "MARCO ROSSI\nMilan, Italy · marco.rossi@email.com · +39 333 0000000 · linkedin.com/in/marcorossi\n\nPROFESSIONAL SUMMARY\nBackend Engineer with 5 years of experience building payment systems in Python and Go. Led the migration of a monolith serving 2M users to microservices, cutting p95 latency by 40%.\n\nEXPERIENCE\nSenior Backend Engineer · FinTech Srl · Milan · Jan 2023 – Present\n- Designed and shipped a real-time fraud detection service processing 15k events/s\n- Reduced infrastructure costs by €120k/year by rightsizing Kubernetes workloads\n\nEDUCATION\nMaster's degree in Computer Engineering · Politecnico di Milano · 2020\n\nSKILLS\nPython, Go, PostgreSQL, Kafka, Kubernetes, AWS, Terraform · English C1, Italian native",
        },
      },
      {
        h2: "Errori di lingua più frequenti",
        list: [
          "Falsi amici: \"actually\" non significa \"attualmente\" (currently), \"eventually\" non è \"eventualmente\" (possibly), \"formation\" non è \"formazione\" (education).",
          "Titoli di ruolo tradotti alla lettera: \"Responsabile commerciale\" è Sales Manager, non \"Commercial Responsible\".",
          "\"Stage\" in inglese è internship; \"stage\" significa palcoscenico.",
          "Date all'italiana: usa \"Jan 2023 – May 2025\" o \"01/2023 – 05/2025\", mai \"gennaio 2023\".",
          "Frasi in prima persona (\"I managed\"): nel resume il soggetto è sottinteso, si parte dal verbo.",
        ],
      },
    ],
    faq: [
      {
        q: "Il CV in inglese deve avere la foto?",
        a: "No. Nei paesi anglosassoni la foto non si mette e diversi ATS scartano i CV che la contengono. Fa eccezione la Germania, dove è ancora diffusa ma non obbligatoria.",
      },
      {
        q: "Quanto deve essere lungo un CV in inglese?",
        a: "Una pagina fino a 7-8 anni di esperienza, due pagine per profili senior. Le aziende americane si aspettano una pagina.",
      },
      {
        q: "Devo tradurre il nome del titolo di studio?",
        a: "Sì, con l'equivalente riconosciuto: Bachelor's degree, Master's degree, PhD. Puoi lasciare il nome italiano dell'università. Il voto in centodecimi va spiegato tra parentesi o omesso.",
      },
    ],
    related: ["cv-ats-friendly", "lettera-di-presentazione-esempio", "come-candidarsi-su-linkedin"],
    cta: CTA_CV,
  },
  {
    slug: "software-candidature-automatiche",
    title: "Software per candidature automatiche: confronto 2026 (LazyApply, Simplify, Sonara, LavorAI)",
    metaTitle: "Software candidature automatiche: confronto 2026",
    description:
      "Cosa fanno davvero i tool di auto-apply, quali rischiano il ban su LinkedIn, quanto costano e come scegliere. Confronto tra LazyApply, Simplify, Sonara, LoopCV e LavorAI.",
    keywords: ["software candidature automatiche", "auto apply lavoro", "candidarsi automaticamente ai lavori", "lazyapply alternativa", "bot candidature linkedin", "auto apply italiano"],
    published: "2026-09-08",
    updated: "2026-09-08",
    category: "Strumenti",
    intro: [
      "I software per candidature automatiche promettono la stessa cosa: tu carichi il CV, loro inviano le candidature. Sotto questa promessa ci sono però approcci molto diversi, con differenze enormi in qualità delle candidature, rischio per i tuoi account e trasparenza su cosa viene inviato davvero.",
      "Questo confronto è scritto da chi sviluppa uno di questi strumenti (LavorAI), quindi non è neutrale. Cerca però di essere onesto sui limiti di ogni approccio, compreso il nostro, perché chi sceglie male perde tempo e a volte l'account LinkedIn.",
    ],
    sections: [
      {
        h2: "Tre modi di automatizzare, tre livelli di rischio",
        list: [
          "Bot che cliccano dentro LinkedIn o Indeed (estensioni del browser). Massimo volume, candidature generiche, violano i termini di LinkedIn: le sospensioni degli account sono frequenti.",
          "Autocompilazione assistita (estensioni che riempiono i form quando li apri tu). Sicure, ma non risparmiano il lavoro di cercare gli annunci e adattare i documenti.",
          "Agenti che trovano gli annunci, riscrivono CV e lettera per ciascuno e compilano i form esterni degli ATS (Greenhouse, Lever, Ashby, Workable) senza toccare il tuo account LinkedIn. Volume medio, qualità alta, nessun rischio di ban.",
        ],
      },
      {
        h2: "Confronto sintetico",
        paragraphs: [
          "Dati aggiornati a settembre 2026 dai siti ufficiali; prezzi indicativi, verifica sempre la pagina del fornitore.",
        ],
        list: [
          "LazyApply: bot Chrome per LinkedIn, Indeed e ZipRecruiter. Fino a centinaia di candidature al giorno, CV unico per tutte. Licenza a vita da circa 100 dollari. Rischio sospensione account, nessun adattamento del CV, orientato al mercato USA.",
          "Simplify: estensione gratuita che autocompila i form ATS mentre navighi, con una versione a pagamento per l'AI. Nessuna automazione della ricerca; ottima come assistente manuale, in inglese.",
          "Sonara: agente che cerca e invia candidature in automatico, mercato USA, da circa 30 dollari a settimana. Non supporta annunci italiani.",
          "LoopCV: piattaforma europea che invia CV via email e su alcuni portali, con cicli automatici. Adattamento del CV limitato, interfaccia in inglese.",
          "LavorAI: agente italiano che trova annunci in Italia, Europa e remote, riscrive CV e lettera per ogni annuncio con Claude, compila i form di Greenhouse, Lever, Ashby, SmartRecruiters e Workable e mostra la prova di consegna di ogni invio. 3 candidature gratis, poi da 19,99 euro al mese per 50 candidature. Non automatizza i form che richiedono login LinkedIn o Indeed.",
        ],
      },
      {
        h2: "Le domande da fare prima di scegliere",
        list: [
          "Cosa viene inviato esattamente? Chiedi di vedere una candidatura reale prodotta dal tool prima di pagare.",
          "Il CV viene adattato a ogni annuncio o è lo stesso per tutti? I tassi di risposta cambiano di 2-3 volte.",
          "Usa il mio account LinkedIn? Se sì, il rischio di sospensione è tuo.",
          "Posso approvare ogni candidatura prima dell'invio? Una modalità ibrida (approva prima di inviare) è essenziale all'inizio.",
          "Come dimostra che la candidatura è arrivata? Screenshot, risposta del server, email di conferma dell'azienda.",
          "Dove sono i miei dati? Per un tool europeo servono server in UE e cancellazione dell'account in un clic.",
        ],
      },
      {
        h2: "Cosa nessun tool può fare",
        paragraphs: [
          "Nessun software supera un colloquio, né fa passare un CV che non regge ai requisiti minimi. L'automazione moltiplica quello che hai: se il profilo è chiaro e il posizionamento corretto, 50 candidature curate al mese cambiano la ricerca. Se il CV ha problemi di fondo, li moltiplica. Per questo è utile analizzare il CV prima di attivare qualsiasi automazione.",
          "Inoltre, i portali che richiedono login o captcha complessi (LinkedIn Easy Apply, Indeed, molte pagine carriere aziendali fatte in casa) restano manuali per chiunque dichiari il contrario senza usare bot che violano i termini di servizio.",
        ],
      },
    ],
    faq: [
      {
        q: "I software di auto-apply sono legali?",
        a: "Sì. Il punto non è la legge ma i termini di servizio delle piattaforme: LinkedIn e Indeed vietano i bot sul proprio sito e sospendono gli account. Compilare i form degli ATS aziendali, dove non c'è un account tuo, non viola nessun termine.",
      },
      {
        q: "Le candidature automatiche funzionano?",
        a: "Funzionano se ogni candidatura è adattata all'annuncio. Le candidature automatiche generiche hanno tassi di risposta molto bassi e possono danneggiare la reputazione del candidato presso lo stesso recruiter.",
      },
      {
        q: "Esiste un'alternativa italiana a LazyApply?",
        a: "LavorAI è pensato per il mercato italiano ed europeo: annunci in Italia e remote, CV e lettera riscritti in italiano o inglese per ogni annuncio, form ATS compilati senza usare il tuo account LinkedIn.",
      },
    ],
    related: ["quante-candidature-per-trovare-lavoro", "come-candidarsi-su-linkedin", "cv-ats-friendly"],
    cta: CTA_AUTO,
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

export function readingMinutes(g: Guide): number {
  const text = [
    ...g.intro,
    ...g.sections.flatMap((s) => [s.h2, ...(s.paragraphs ?? []), ...(s.list ?? []), s.example?.body ?? ""]),
    ...g.faq.flatMap((f) => [f.q, f.a]),
  ].join(" ");
  return Math.max(3, Math.round(text.split(/\s+/).length / 200));
}
