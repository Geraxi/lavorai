import type { NegotiationScenario } from "../types";

/**
 * Script di negoziazione pronti. Tutti in italiano professionale.
 * Le frasi principali sono testate per essere pronunciabili senza
 * sembrare scriptate. Includere SEMPRE: context, script, varianti,
 * cosa rispondere se l'altro fa pushback.
 */

export const NEGOTIATION_SCRIPTS: NegotiationScenario[] = [
  {
    id: "salary_4k_equity_5",
    title: "4k/mese + 5 % equity (co-founder positioning)",
    context:
      "Hai accettato di andare avanti con i discorsi. Ti chiedono numeri. L'azienda è early-stage e tu sei posizionato come co-founder.",
    script:
      "Indicativamente, per una struttura full commitment con reale ownership da co-founder, il mio riferimento sarebbe una base intorno ai 4.000 mensili con una partecipazione equity significativa, idealmente nell'ordine del 5 %, naturalmente da definire in base alla struttura complessiva del ruolo.",
    followUpVariants: [
      "Il 5 % è uno startpoint. Se la struttura del ruolo è effettivamente co-founder con responsabilità tecniche complete, il range che ho in mente è 4-7 % con vesting standard 4 anni / cliff 12 mesi.",
      "Il numero specifico è meno importante della struttura. Quello che cerco è coerenza tra fisso più contenuto e equity proporzionata. Se la vostra struttura tradizionale dà più cash e meno equity, sono aperto a discutere il mix.",
    ],
    bridgeIfPushback:
      "Capisco. Mi è utile capire qual è il vostro range tipico per ruoli equivalenti e in quale categoria mi posizionate — co-founder, founding engineer, o senior employee. Sono numeri diversi.",
    tone: "diretto",
  },
  {
    id: "salary_5k_equity_2_3",
    title: "5k/mese + 2-3 % equity (founding-engineer positioning)",
    context:
      "Posizionamento meno aggressivo. Adatto a Series A o post-seed con stipendio competitivo.",
    script:
      "Per un ruolo di tipo founding engineer con responsabilità tecniche significative ma non co-founder pieno, il mio riferimento è 5.000 mensili più un equity in range 2-3 %, sempre con vesting 4/1 standard. Mi sento sui valori medi del mercato early-stage europeo per questo tipo di ruolo.",
    followUpVariants: [
      "Se preferite spostare di più sul cash e meno sull'equity, possiamo discutere 5.500-6.000 con equity 1.5-2 %.",
      "L'equity è meno importante della liquidity preference dei round precedenti. Mi mostrate la struttura attuale del cap table?",
    ],
    bridgeIfPushback:
      "Quale parte della struttura è più tensionata: il fisso o l'equity? Posso ottimizzare su uno o sull'altro, ma il package totale deve restare nel range che ho condiviso.",
    tone: "esplorativo",
  },
  {
    id: "lower_salary_higher_equity",
    title: "Stipendio più basso ma equity maggiore",
    context:
      "L'azienda non può salire sul cash. Tu vedi upside reale. Stai cercando di aumentare equity in cambio di flessibilità sul fisso.",
    script:
      "Se la struttura cash è vincolata, sono disponibile a scendere sul fisso a [X] in cambio di un'equity più significativa — diciamo +1.5-2 % sopra il vostro range standard, con acceleration clause in caso di change-of-control. Su queste basi possiamo lavorare.",
    followUpVariants: [
      "Aggiungerei: voglio anche capire le condizioni del prossimo round, perché la mia equity diluirà. Antidilution rights pro-rata sono parte della negoziazione.",
      "L'altro elemento che renderebbe il trade-off accettabile è una struttura di refresh grant esplicita dopo i 4 anni di vesting iniziale.",
    ],
    bridgeIfPushback:
      "Capisco se non potete extra-equity. Allora servirebbe almeno un performance bonus annuale legato a milestone aziendali — qualcosa che renda il risk/reward bilanciato.",
    tone: "fermo",
  },
  {
    id: "flexible_initial_phase",
    title: "Fase iniziale flessibile (no full-time subito)",
    context:
      "Vuoi entrare gradualmente per validare l'azienda prima di lasciare il lavoro attuale.",
    script:
      "Vorrei capire meglio il livello di commitment operativo richiesto per questa posizione. Parliamo di una figura full-time esclusiva fin da subito oppure esiste una fase iniziale più flessibile, soprattutto nella fase di allineamento strategico e validazione reciproca?",
    followUpVariants: [
      "Una proposta concreta: 4-6 settimane di trial come consulente part-time (10-15 ore/settimana) con compenso ridotto, poi conversion a full-time se entrambi vediamo allineamento. Vesting parte dalla data di full-time.",
      "Sono in una fase dove sto già portando avanti dei progetti, e prima di lasciare quello che ho voglio essere sicuro al 100 % della scelta. La fase di trial protegge entrambi.",
    ],
    bridgeIfPushback:
      "Capisco se preferite full-time subito. Allora la conversazione si sposta sul package: con full-time immediato il rischio per me è più alto, quindi la struttura comp deve compensarlo.",
    tone: "esplorativo",
  },
  {
    id: "ai_subscriptions",
    title: "AI subscriptions pagate dall'azienda",
    context:
      "Vuoi che l'azienda copra tool AI di lavoro (Claude, OpenAI, Cursor, ecc.).",
    script:
      "Per lavorare in modo realmente efficiente su prodotti AI-native, considero fondamentale avere accesso agli strumenti migliori sul mercato: OpenAI, Claude, Cursor, Lovable, strumenti di automazione e altre subscription operative. Vorrei capire se queste risorse vengono fornite direttamente dall'azienda come parte dell'infrastruttura di lavoro.",
    followUpVariants: [
      "Indicativamente, un budget tool di 200-400 € mensili è standard per ruoli AI-native senior. Se la vostra policy è 'l'employee paga e poi reimburse', va bene comunque, ma chiariamo il limite.",
      "Per lavorare sui workflow di automazione vi servirà che io abbia accesso anche ad API key dei vostri provider — discutiamo come gestire policy di security e shared accounts.",
    ],
    bridgeIfPushback:
      "Se non c'è un tool budget dedicato, mi sta bene includerlo come line item del package totale di comp. Quello che mi serve è certezza sull'accesso, non sulla forma contrattuale.",
    tone: "diretto",
  },
  {
    id: "clarify_commitment",
    title: "Chiarimento full-time vs part-time",
    context:
      "L'annuncio o l'email iniziale sono ambigui. Vuoi precisione prima di proseguire.",
    script:
      "Prima di entrare nel merito, mi è utile chiarire un punto: questa è una posizione full-time esclusiva, oppure è compatibile con altri progetti / impegni in parallelo, soprattutto nella fase iniziale?",
    followUpVariants: [
      "Lo chiedo perché ho alcuni progetti personali in corso che genereranno revenue. Voglio assicurarmi che non ci siano conflitti contrattuali o tempo che non posso allocare a 100 % sul vostro ruolo.",
      "Se è full-time esclusiva, capiamo cosa significa concretamente: clausola di non-compete? Obbligo di disclosure di side projects?",
    ],
    bridgeIfPushback:
      "Va bene full-time esclusiva. La domanda successiva diventa la compensation, perché lasciare i miei progetti ha un costo opportunity che va compensato.",
    tone: "esplorativo",
  },
  {
    id: "personal_projects",
    title: "Compatibilità con progetti personali",
    context:
      "Stai già costruendo cose tue e vuoi proteggere il diritto di continuare. Anche per validare se l'azienda è builder-friendly.",
    script:
      "Parallelamente alla mia attività operativa, sto già costruendo e validando alcuni progetti verticali nel mondo proptech e AI-native, con revenue model chiari e forte scalabilità potenziale. Per me è molto interessante confrontarmi con realtà che non ragionano solo in ottica di hiring, ma anche di venture building e crescita strategica.",
    followUpVariants: [
      "Concretamente, mi interessa capire la vostra policy su side projects: posso continuare a far evolvere i miei in tempo extra-lavorativo senza issue contrattuali?",
      "Se l'azienda è interessata a valutare collaborazioni o investimenti sui miei progetti, sono disponibile ad aprire quel discorso parallelo.",
    ],
    bridgeIfPushback:
      "Se la policy interna è 'no side projects', è una informazione importante. Mi aiuta a decidere se la fit è giusta, non è un dealbreaker automatico ma è un trade-off che voglio valutare consapevolmente.",
    tone: "fermo",
  },
  {
    id: "investment_in_own_projects",
    title: "Possibilità di investimento sui propri progetti",
    context:
      "Stai parlando con un venture studio, accelerator, o una holding che potrebbe diventare co-founder/investor dei tuoi progetti.",
    script:
      "Una domanda strategica: la vostra struttura valuta solo founder esterni come dipendenti, o esiste un percorso in cui un operator interno può portare i suoi progetti dentro il venture model e ottenere supporto / investment / scale-up?",
    followUpVariants: [
      "FoolFarm — o realtà equivalenti — lavora esclusivamente su venture costruite internamente oppure valutate anche founder esterni con prodotti già validati e pronti per scale-up?",
      "Se la risposta è positiva, vorrei capire term sheet tipici: dimensione del check, equity richiesta, governance, services offerti.",
    ],
    bridgeIfPushback:
      "Capito, valutate solo internal venture. Allora resta utile sapere se i progetti che porto avanti in privato possono restare separati dal contratto con voi — è un punto di compatibilità per me.",
    tone: "esplorativo",
  },
];

export function getScenarioById(
  id: string,
): NegotiationScenario | undefined {
  return NEGOTIATION_SCRIPTS.find((s) => s.id === id);
}
