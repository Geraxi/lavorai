import type { FounderVocabularyTerm } from "../types";

/**
 * Vocabolario founder-level. 30+ termini per il Vocabulary Trainer.
 * Frasi scritte in italiano professionale, già pronte da pronunciare.
 */

export const FOUNDER_VOCABULARY: FounderVocabularyTerm[] = [
  {
    id: "ownership",
    term: "Ownership",
    category: "ownership",
    definitionSimple:
      "Il grado di possesso e responsabilità diretta su un risultato. In ambito startup spesso significa avere skin-in-the-game tramite equity.",
    whenToUse:
      "Quando vuoi posizionarti come builder, non come dipendente. In risposta a 'perché dovremmo darti equity?'",
    readyPhrase:
      "Per me l'ownership non è una metrica psicologica: è un meccanismo strutturale. Se sono responsabile dell'outcome, devo avere skin-in-the-game proporzionato.",
    commonMistake:
      "Usare 'ownership' come buzzword senza collegarlo a equity, autonomia decisionale o accountability misurabile.",
  },
  {
    id: "equity",
    term: "Equity",
    category: "ownership",
    definitionSimple:
      "Partecipazione al capitale dell'azienda. Può essere azioni reali, stock options o phantom equity — sono cose diverse.",
    whenToUse:
      "Sempre quando si parla di comp con startup. Chiedi sempre di chiarire il tipo.",
    readyPhrase:
      "Quando parliamo di equity, mi è utile capire se si tratta di partecipazione societaria reale, stock options o phantom equity.",
    commonMistake:
      "Accettare 'equity' senza chiarire il veicolo legale (shares vs options vs phantom). Sono tre mondi fiscali diversi.",
  },
  {
    id: "vesting",
    term: "Vesting",
    category: "ownership",
    definitionSimple:
      "Il meccanismo per cui le azioni o le opzioni maturano nel tempo. Tipico: 4 anni con cliff 1 anno (niente per 12 mesi, poi mensile o trimestrale).",
    whenToUse: "Sempre quando ti propongono equity. Standard di mercato: 4 anni / 1 anno di cliff.",
    readyPhrase:
      "Sul vesting, lo standard di mercato che mi aspetto è 4 anni con un cliff di 12 mesi e maturazione mensile dopo. Confermate questa struttura?",
    commonMistake: "Accettare vesting senza cliff (= ti tieni l'equity anche se vai via dopo 2 mesi → male per founder, sospetto per dipendente).",
  },
  {
    id: "cliff",
    term: "Cliff",
    category: "ownership",
    definitionSimple:
      "Periodo iniziale (tipico 12 mesi) durante il quale nulla matura. Se vai via prima, equity = zero. Dopo il cliff, di solito matura mensilmente.",
    whenToUse: "Quando discuti la struttura di vesting, soprattutto per ruoli co-founder.",
    readyPhrase:
      "Il cliff di 12 mesi è ragionevole. Voglio capire se è applicato a tutti i founder esistenti allo stesso modo o sono trattamenti diversi.",
    commonMistake:
      "Non chiedere se il cliff è applicato simmetricamente ai founder esistenti. Asimmetrie qui sono red flag enormi.",
  },
  {
    id: "dilution",
    term: "Dilution",
    category: "valuation",
    definitionSimple:
      "Riduzione percentuale della tua quota quando l'azienda emette nuove azioni in un round successivo. Tipica per round: 15-25 %.",
    whenToUse: "Quando valuti il valore reale dell'equity offerta in early-stage.",
    readyPhrase:
      "Mi è utile capire come la mia quota verrà diluita nei prossimi due round. Avete un modello di cap table proiettato?",
    commonMistake: "Calcolare il valore della tua equity sulla valutation attuale senza modellare i prossimi 2-3 round di dilution.",
  },
  {
    id: "governance",
    term: "Governance",
    category: "ownership",
    definitionSimple:
      "Le regole e le strutture decisionali dell'azienda: board, voting rights, veto rights, protective provisions.",
    whenToUse: "Per ruoli co-founder / CTO. Capire chi decide cosa è centrale.",
    readyPhrase:
      "Sulla governance: a quale board ho accesso e su quali decisioni ho un effettivo voting right?",
    commonMistake: "Avere il titolo 'co-founder' senza alcun voting right né board seat.",
  },
  {
    id: "upside",
    term: "Upside",
    category: "ownership",
    definitionSimple:
      "Il potenziale guadagno futuro derivante dall'equity in caso di exit/IPO. Distinto dal salario fisso.",
    whenToUse: "Quando giustifichi accettare un salario sotto-mercato in cambio di equity significativa.",
    readyPhrase:
      "Se il fisso è più contenuto, l'upside deve essere realmente significativo e strutturato in modo serio.",
    commonMistake: "Calcolare l'upside come 'percentuale × valuation attuale' senza considerare liquidation preference né dilution.",
  },
  {
    id: "compensation_structure",
    term: "Compensation structure",
    category: "compensation",
    definitionSimple:
      "L'insieme di salario fisso + variable + equity + benefit. In founder roles, l'equity può dominare il valore totale.",
    whenToUse: "Quando inizi una negoziazione comp, per fare framing prima di parlare di numeri.",
    readyPhrase:
      "Prima di parlare di numeri specifici, mi è utile capire la struttura complessiva: split tra cash, equity e benefit operativi.",
    commonMistake: "Negoziare solo sul fisso senza ottimizzare sul mix totale.",
  },
  {
    id: "runway",
    term: "Runway",
    category: "operations",
    definitionSimple:
      "Quanti mesi di cassa l'azienda ha prima di dover raccogliere altri capitali. Calcolato come liquidità / burn rate mensile.",
    whenToUse: "Per valutare il rischio dell'opportunità. Sotto i 12 mesi = pressure mode.",
    readyPhrase: "Quanti mesi di runway avete oggi e qual è il piano di fundraising nei prossimi 6-12 mesi?",
    commonMistake: "Accettare un ruolo in azienda con runway < 9 mesi senza capire la roadmap di funding.",
  },
  {
    id: "burn_rate",
    term: "Burn rate",
    category: "operations",
    definitionSimple:
      "Quanto cash l'azienda brucia ogni mese. Net burn = cash out - cash in. Una metrica chiave per capire la sostenibilità.",
    whenToUse: "Quando vuoi valutare la salute finanziaria reale, non i numeri da pitch.",
    readyPhrase:
      "Il burn rate mensile attuale è gross o net? Qual è il path verso default-alive?",
    commonMistake: "Confondere gross burn (spese totali) con net burn (spese - revenue). Cambia tutto.",
  },
  {
    id: "pre_money",
    term: "Pre-money valuation",
    category: "valuation",
    definitionSimple:
      "La valuation dell'azienda prima dell'iniezione del nuovo round. È il numero che usi per calcolare l'equity offerta.",
    whenToUse: "Per capire se l'equity proposta vale davvero qualcosa.",
    readyPhrase: "Qual è la pre-money valuation di riferimento al momento dell'assegnazione delle stock option?",
    commonMistake: "Confondere pre-money con post-money (post = pre + capitale raccolto).",
  },
  {
    id: "post_money",
    term: "Post-money valuation",
    category: "valuation",
    definitionSimple:
      "La valuation dell'azienda subito dopo l'iniezione del nuovo capitale. = pre-money + nuovo investment.",
    whenToUse: "Per calcolare la percentuale di equity che gli investitori si sono presi nel round.",
    readyPhrase: "Sulla base della post-money del round seed, qual è l'ownership effettiva dei founder oggi?",
    commonMistake: "Calcolare la tua diluizione sulla pre-money. Si usa la post-money.",
  },
  {
    id: "cap_table",
    term: "Cap table",
    category: "ownership",
    definitionSimple:
      "Tabella che mostra chi possiede quanto dell'azienda: founder, investitori, dipendenti, option pool.",
    whenToUse: "Sempre per ruoli co-founder o C-level. Se ti rifiutano di mostrarla → red flag.",
    readyPhrase:
      "Per allinearmi correttamente, mi sarebbe utile vedere il cap table sintetico — almeno le tre categorie principali: founder, investor, employee pool.",
    commonMistake: "Accettare il ruolo senza mai vedere il cap table. Stai firmando alla cieca.",
  },
  {
    id: "liquidation_preference",
    term: "Liquidation preference",
    category: "exit",
    definitionSimple:
      "Diritto degli investitori di essere pagati prima di te in caso di exit. Standard: 1x non-partecipating. Tossico: 2-3x participating.",
    whenToUse: "Critico per ruoli con equity in startup seed/Series A.",
    readyPhrase:
      "Le liquidation preference dei round precedenti sono 1x non-partecipating standard?",
    commonMistake: "Ignorare liquidation preference → in exit medio, gli investitori prendono tutto e tu zero.",
  },
  {
    id: "acceleration_clause",
    term: "Acceleration clause",
    category: "exit",
    definitionSimple:
      "Clausola che fa vestare immediatamente le tue equity in caso di acquisizione (single-trigger) o acquisizione + licenziamento (double-trigger).",
    whenToUse: "Negozialo SEMPRE se hai un ruolo C-level o co-founder.",
    readyPhrase:
      "In caso di change-of-control, mi aspetto almeno una double-trigger acceleration sulle equity non ancora vestite.",
    commonMistake: "Non chiederla, poi venire acquistati e perdere tutto perché l'acquirente ti licenzia.",
  },
  {
    id: "right_of_first_refusal",
    term: "Right of first refusal (ROFR)",
    category: "ownership",
    definitionSimple:
      "Diritto dell'azienda (o di altri shareholder) di comprare le tue azioni prima che tu possa venderle a terzi.",
    whenToUse: "Quando vuoi capire la tua libertà di vendere in secondary.",
    readyPhrase:
      "Esiste un right of first refusal sui miei share? In che timeframe?",
    commonMistake: "Pensare di poter vendere liberamente le azioni quando c'è ROFR attivo.",
  },
  {
    id: "lock_up",
    term: "Lock-up period",
    category: "exit",
    definitionSimple:
      "Periodo post-IPO durante il quale non puoi vendere le tue azioni. Standard: 6 mesi.",
    whenToUse: "Per ruoli in pre-IPO. Cambia il tuo cash-out timing.",
    readyPhrase: "Qual è il lock-up post-IPO previsto per i dipendenti?",
    commonMistake: "Sottovalutare l'impatto del lock-up sul tuo piano finanziario personale.",
  },
  {
    id: "product_market_fit",
    term: "Product-market fit (PMF)",
    category: "go_to_market",
    definitionSimple:
      "Quando il prodotto risponde a una domanda di mercato reale e cresce in modo organico. Spesso misurato con retention + NPS.",
    whenToUse: "Per capire se l'azienda è in 'find PMF' (alto rischio) o 'scale PMF'.",
    readyPhrase:
      "Quali sono le metriche con cui valutate il vostro product-market fit oggi, e qual è la priorità: trovarlo o scalarlo?",
    commonMistake: "Accettare la dichiarazione 'abbiamo PMF' senza chiedere metriche di retention o cohort behavior.",
  },
  {
    id: "go_to_market",
    term: "Go-to-market (GTM)",
    category: "go_to_market",
    definitionSimple:
      "La strategia con cui l'azienda porta il prodotto agli utenti: outbound sales, product-led growth, partnership, ecc.",
    whenToUse:
      "Quando capisci come l'azienda farà revenue. Ruoli tech che ignorano GTM = pesce fuori dall'acqua.",
    readyPhrase:
      "Qual è il GTM motion principale oggi e come si evolverà nei prossimi 18 mesi?",
    commonMistake: "Pensare che 'product-led growth' significhi 'non serve sales team'.",
  },
  {
    id: "scalability",
    term: "Scalability",
    category: "operations",
    definitionSimple:
      "La capacità del business di crescere senza crescita lineare dei costi. AI-native businesses tendono ad essere altamente scalabili.",
    whenToUse: "Quando spieghi perché un certo approccio architetturale è importante.",
    readyPhrase:
      "Vediamo quali workflow sono scalability-bound oggi e come possiamo ridurre il cost-per-unit con automazione AI.",
    commonMistake: "Confondere scalability tecnica (server) con scalability di business (margini).",
  },
  {
    id: "leverage",
    term: "Leverage",
    category: "strategy",
    definitionSimple:
      "Moltiplicatore dell'output per unità di input. AI è leverage: una persona produce quanto 5 con i tool giusti.",
    whenToUse: "Quando giustifichi tool budget o approcci automation-first.",
    readyPhrase:
      "Voglio capire come massimizzare il leverage del team. Quali tool AI sono parte dell'infrastruttura aziendale?",
    commonMistake: "Usare 'leverage' come buzzword senza quantificare l'impatto.",
  },
  {
    id: "execution",
    term: "Execution",
    category: "strategy",
    definitionSimple:
      "La capacità di trasformare strategia in risultati misurabili in cicli rapidi.",
    whenToUse: "Per posizionarti come builder. Founder-level conversations sono execution-focused.",
    readyPhrase:
      "Il valore reale è nell'execution. Posso portarvi cicli di build → ship → learn settimanali, non trimestrali.",
    commonMistake: "Dire 'sono bravo in execution' senza un esempio concreto di velocità.",
  },
  {
    id: "founder_market_fit",
    term: "Founder-market fit",
    category: "strategy",
    definitionSimple:
      "Match tra il background del founder e il mercato che sta attaccando. Investitori lo cercano molto.",
    whenToUse: "Quando spieghi perché tu sei la persona giusta per questo specifico ruolo.",
    readyPhrase:
      "Vedo un founder-market fit forte tra il mio background in [X] e quello che state costruendo in [Y].",
    commonMistake: "Forzare il framing FMF quando non c'è. Onestà > pitch.",
  },
  {
    id: "operator",
    term: "Operator",
    category: "operations",
    definitionSimple:
      "Persona che esegue, scala e ottimizza un business. Distinto dall'investor o dal pure founder visionario.",
    whenToUse: "Per ruoli di tipo CTO o COO. Posizionati come operator + builder.",
    readyPhrase: "Mi posiziono come operator: prendo direzione strategica e la converto in ship rate.",
    commonMistake: "Usarlo per descrivere ruoli puramente manageriali senza ownership tecnica.",
  },
  {
    id: "builder",
    term: "Builder",
    category: "strategy",
    definitionSimple:
      "Persona che costruisce concretamente prodotti (codice, design, contenuti, processi). Opposto del manager-only.",
    whenToUse: "Per posizionarti come hands-on, non come consultant.",
    readyPhrase: "Sono un builder. Il mio output è ship, non slide decks.",
    commonMistake: "Definirsi builder e poi mostrare solo decks in interview.",
  },
  {
    id: "revenue_driver",
    term: "Revenue driver",
    category: "go_to_market",
    definitionSimple:
      "L'attività o componente che genera la maggior parte del revenue. Diverso dal 'cost driver'.",
    whenToUse: "Quando proponi prioritizzazioni di roadmap basate su impatto economico.",
    readyPhrase:
      "Vorrei capire quali sono i top 3 revenue driver oggi e quale di questi ha più upside di automazione AI.",
    commonMistake: "Confondere 'cosa fa rumore' con 'cosa fa cash'.",
  },
  {
    id: "investor_readiness",
    term: "Investor readiness",
    category: "valuation",
    definitionSimple:
      "Stato di preparazione di un'azienda (metrics, data room, narrative) per fare fundraising di successo.",
    whenToUse: "Per ruoli che includono fundraising responsibility o board prep.",
    readyPhrase:
      "Posso contribuire all'investor readiness lavorando su data room, metric instrumentation e narrative tecnica.",
    commonMistake: "Usarlo come label vago senza specificare il lavoro reale che serve.",
  },
  {
    id: "exit_strategy",
    term: "Exit strategy",
    category: "exit",
    definitionSimple:
      "Il piano di liquidazione del valore: acquisizione, IPO, secondary, buy-back. Influenza tipo di equity che ti conviene.",
    whenToUse: "Per ruoli early-stage. Domanda discriminante.",
    readyPhrase:
      "Qual è la exit thesis oggi: build to scale and IPO, build to sell, o cash-flow positive long-term?",
    commonMistake: "Accettare 'lo decideremo' come risposta. Anche 'non lo so' è una risposta, ma chiedi.",
  },
  {
    id: "seed_round",
    term: "Seed round",
    category: "valuation",
    definitionSimple:
      "Primo round istituzionale (~€500k-€3M). Implica product validation iniziale. Tipico 18-24 mesi prima di Series A.",
    whenToUse: "Per benchmarkare lo stage dell'azienda contro le aspettative di comp.",
    readyPhrase: "Siete in pre-seed o seed pieno? Il prossimo milestone per la Series A qual è?",
    commonMistake: "Confondere 'pre-seed' con 'seed' — diverso runway, diverso rischio, diversa equity expectation.",
  },
  {
    id: "series_a",
    term: "Series A",
    category: "valuation",
    definitionSimple:
      "Round di scaling (~€3M-€15M) dopo PMF. Tipicamente lead da VC. Inizia governance formale con board.",
    whenToUse: "Quando vuoi capire se sei in 'scaling' o ancora in 'searching'.",
    readyPhrase: "Cosa avete fatto vedere ai Series A lead investor per chiudere il round?",
    commonMistake: "Pensare che Series A significhi automaticamente 'safe' — non lo è.",
  },
  {
    id: "strategic_alignment",
    term: "Strategic alignment",
    category: "strategy",
    definitionSimple:
      "Allineamento tra obiettivi personali, di team e di azienda. Critico per ruoli C-level.",
    whenToUse: "Per chiudere conversation di alignment con i founder.",
    readyPhrase:
      "Prima di scendere su numeri operativi, vorrei chiudere uno strategic alignment forte sui 18 mesi.",
    commonMistake: "Dichiarare alignment senza esempi concreti di overlap di vision.",
  },
];

export function vocabularyByCategory(): Record<
  FounderVocabularyTerm["category"],
  FounderVocabularyTerm[]
> {
  const out: Record<string, FounderVocabularyTerm[]> = {};
  for (const t of FOUNDER_VOCABULARY) {
    if (!out[t.category]) out[t.category] = [];
    out[t.category].push(t);
  }
  return out as Record<FounderVocabularyTerm["category"], FounderVocabularyTerm[]>;
}
