import type { InterviewQuestion } from "../types";

/**
 * Catalogo statico di domande founder-level con risposte modello.
 * Le sample answer sono in italiano professionale, founder-tone:
 * diretto, ownership-oriented, business-impact-first.
 */

export const FOUNDER_INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    id: "intro_about_you",
    category: "intro",
    question: "Ci parli di lei.",
    whatTheyEvaluate:
      "Capacità di sintesi, ownership narrative, founder-market fit.",
    framework:
      "1 frase di posizionamento → 2-3 esempi di execution → 1 frase di vision/why-now.",
    sampleAnswer:
      "Sono un builder AI-native: prendo idee, le converto in prodotti spedibili e li valido sul mercato. Negli ultimi 24 mesi ho lanciato [X] e [Y], il primo con revenue da subito, il secondo come MVP usato da [Z]. Quello che cerco ora è un contesto dove la velocità di execution che porto si combina con un mercato in cui l'AI sta riscrivendo le regole — è esattamente quello che state costruendo voi.",
    pitfalls: [
      "Raccontare il CV in ordine cronologico inverso",
      "Aprire con dove sono nato / dove ho studiato",
      "Non collegare il 'who' al 'why questa azienda'",
    ],
  },
  {
    id: "why_this_role",
    category: "motivation",
    question: "Perché vuole questo ruolo?",
    whatTheyEvaluate:
      "Match tra ambizione personale e ruolo. Se sei interessato all'azienda o solo a un job.",
    framework:
      "Quello che voglio costruire → perché QUI è il posto giusto → cosa porto in cambio.",
    sampleAnswer:
      "Cerco un ruolo dove ho leverage reale, non gestione di un team. Il vostro stage Seed + il fatto che state costruendo [prodotto] in [mercato] mi convince per due ragioni: il timing del mercato è ora, e il vostro DNA tecnico mi sembra solido. Il mio contributo: prendo la roadmap tecnica e la converto in cicli settimanali di build → ship → learn.",
    pitfalls: [
      "Dire 'mi piace molto il vostro prodotto' senza specificare COSA del prodotto",
      "Aprire con 'cerco una nuova sfida'",
      "Non parlare del business, solo della tech stack",
    ],
  },
  {
    id: "why_you",
    category: "motivation",
    question: "Perché dovremmo scegliere lei?",
    whatTheyEvaluate:
      "Asymmetric value proposition. Cosa hai che gli altri candidati non hanno.",
    framework:
      "1 vantaggio asimmetrico → 1 proof point recente → 1 framing di leverage.",
    sampleAnswer:
      "Tre cose. Uno: ho ship rate da founder, non da impiegato — l'ultima volta ho portato un MVP da zero a primi paying user in 6 settimane. Due: lavoro AI-native, quindi parlo il linguaggio dei tool che oggi spostano il 10x di produttività. Tre: ho già responsabilità di ownership, non devo imparare a comportarmi come co-founder. Se cercate qualcuno che esegue, non sono il candidato 'medio'.",
    pitfalls: [
      "Listare hard skills (li hanno già letti sul CV)",
      "Dire 'sono molto motivato' / 'sono un fast learner'",
      "Non chiudere con un proof point quantificabile",
    ],
  },
  {
    id: "ai_experience",
    category: "ai_experience",
    question: "Che esperienza ha con l'AI?",
    whatTheyEvaluate:
      "Profondità tecnica vs hype literacy. Se sei un user, un builder, o un architect.",
    framework:
      "User layer → builder layer → architect layer. Mostrarti su tutti e tre.",
    sampleAnswer:
      "User: uso Claude, Cursor, Lovable, Replit Agents come parte dell'infrastruttura quotidiana, non come gadget. Builder: ho integrato LLM API in prodotti reali — la mia ultima feature usa [esempio: streaming + tool-use + retry policy]. Architect: ragiono in termini di prompt-as-code, eval pipeline, cost-per-call. Posso parlarvi nei dettagli di una qualunque di queste tre dimensioni se utile.",
    pitfalls: [
      "Restare al livello user ('uso ChatGPT')",
      "Esagerare il livello architect senza concrete examples",
      "Confondere AI con automation generica",
    ],
  },
  {
    id: "uncertainty",
    category: "uncertainty",
    question: "Come gestisce l'incertezza?",
    whatTheyEvaluate:
      "Tolleranza al rischio, framework decisionale, comfort col chaos di startup.",
    framework:
      "Riconosci che l'incertezza è feature non bug → mostra un meccanismo concreto che usi → un esempio recente.",
    sampleAnswer:
      "L'incertezza è il default state di una startup, non un'eccezione. Il mio approccio: riduco l'incertezza decisionale dimensionando le decisioni — Type 1 (irreversibili, lente, costose) vs Type 2 (reversibili, veloci, low-cost). Le Type 2 le prendo in giornata e le testo. Esempio recente: dovevamo scegliere tra due stack architetturali. Anziché due settimane di analisi, ho fatto due spike di 2 giorni ciascuno. Decisione presa il giorno 5.",
    pitfalls: [
      "Dire 'sono molto resiliente' senza meccanismo",
      "Negare l'esistenza di incertezza ('pianifico tutto')",
      "Esempi solo personali, non professionali",
    ],
  },
  {
    id: "tech_team_leadership",
    category: "leadership",
    question: "Come guida un team tecnico?",
    whatTheyEvaluate:
      "Stile di leadership, capacità di scaling, equilibrio tra autonomia e direction.",
    framework:
      "Principio operativo → esempio concreto di system → come misuri il successo.",
    sampleAnswer:
      "Tre principi: clarity di vision, autonomy di execution, accountability di outcome. Concretamente: scrivo un weekly priority memo (cosa, perché, success metric) e l'engineering team decide come. Sui big rocks faccio architecture review settimanale, sui small rocks zero override. Misuro: ship rate, defect rate, retention dei senior. Sono junior-friendly ma non junior-only — il team migliore è 2 senior + 3 mid + 1 junior, in quell'ordine di priorità di hiring.",
    pitfalls: [
      "Stile 'micromanager' o 'hands-off al 100 %' — entrambi falliscono",
      "Non parlare di metrics di team health",
      "Confondere 'team lead' con 'project manager'",
    ],
  },
  {
    id: "tough_tech_decisions",
    category: "decision_making",
    question: "Come prende decisioni tecniche difficili?",
    whatTheyEvaluate:
      "Framework decisionale, gestione dei trade-off, comunicazione con stakeholders non tecnici.",
    framework:
      "Trade-off matrix → reversibility framing → comunicazione al business → ownership del risultato.",
    sampleAnswer:
      "Tre filtri in ordine. Uno: reversibility. Type 2 le delego, Type 1 le prendo io con il team. Due: business impact, non eleganza tecnica — la scelta che muove revenue/retention vince, anche se è la meno bella. Tre: documenting decision. Scrivo un ADR (Architecture Decision Record) di 1 pagina che spiega trade-off considerati e perché ho scelto X. Quando si rivelerà sbagliata in 6 mesi, voglio sapere perché era sembrata giusta oggi.",
    pitfalls: [
      "Decision making solo basato su 'best practice'",
      "Non considerare il costo di reversal",
      "Non comunicare la decisione ai non-tech",
    ],
  },
  {
    id: "why_equity",
    category: "compensation",
    question: "Perché dovremmo darle equity?",
    whatTheyEvaluate:
      "Se capisci cosa rappresenta l'equity, se hai posizionamento founder vs employee, se sei investibile.",
    framework:
      "Riconosci che equity = skin in game → giustifica con outcome ownership → quantifica.",
    sampleAnswer:
      "Equity per me non è perk, è meccanismo. Se sono responsabile dell'outcome — codice in produzione, hire dei prossimi 5 ingegneri, technical decisions che valgono milioni in margine — devo avere skin-in-the-game proporzionato. La metrica giusta non è 'quanto vale oggi', è 'quanto rischio asimmetrico mi state offrendo'. Per un ruolo da co-founder o founding engineer mi aspetto un range nel basso single-digit percentage, con vesting standard 4 anni / 1 anno cliff. Se il vostro framework è diverso, capiamoci sul perché.",
    pitfalls: [
      "Dire 'voglio equity per allinearmi a voi' senza specificare il quanto",
      "Equity expectation senza un anchor numerico",
      "Non collegare equity a outcome ownership",
    ],
  },
  {
    id: "salary_expectation",
    category: "compensation",
    question: "Quanto si aspetta economicamente?",
    whatTheyEvaluate:
      "Self-awareness sul mercato, fermezza nelle negoziazioni, ragionamento sulla comp totale.",
    framework:
      "Total comp framing (cash + equity + benefit) → numero anchor → flessibilità contestuale.",
    sampleAnswer:
      "Prima di un numero specifico, mi è utile capire come ragionate sulla comp totale: split tra cash, equity e benefit operativi (tool, training, eventuali abbonamenti AI). Indicativamente per una struttura full commitment con reale ownership da co-founder, il mio riferimento è una base intorno ai 4.000 mensili con una partecipazione equity significativa, idealmente nell'ordine del 5 %, naturalmente da definire in base alla struttura complessiva del ruolo.",
    pitfalls: [
      "Dare un numero secco al primo turn",
      "Non fare framing sulla comp totale",
      "Negoziare solo cash quando il cash non è dove c'è leverage",
    ],
  },
  {
    id: "5_year_vision",
    category: "vision",
    question: "Dove si vede tra 5 anni?",
    whatTheyEvaluate:
      "Allineamento di lungo termine, ambizione, rischio di flight risk.",
    framework:
      "Outcome professionale (cosa vuoi aver costruito) → impatto sul business loro → onestà.",
    sampleAnswer:
      "In 5 anni voglio aver costruito qualcosa che ha generato cash flow reale e che lascia impatto misurabile sul mercato. Se questo accade in [azienda], significa che vi ho aiutato a passare da [stage attuale] a [stage successivo], magari fino all'IPO o a un'exit strategica. Se accade fuori, accade perché ho usato gli anni qui per imparare cose che fuori non avrei imparato. Sono onesto: non punto a 'restare per restare' — punto a outcome.",
    pitfalls: [
      "Dire 'mi vedo qui' (suona finto)",
      "Dire 'voglio mettermi in proprio in 2 anni' (red flag per assumere)",
      "Vision generica tipo 'crescere come professionista'",
    ],
  },
  {
    id: "conflict_founder",
    category: "conflict",
    question: "Come gestisce conflitti con CEO/founder?",
    whatTheyEvaluate:
      "Maturità relazionale, capacità di disagree-and-commit, ego management.",
    framework:
      "Principio (disagree privately, commit publicly) → esempio concreto → cosa hai imparato.",
    sampleAnswer:
      "Disagree privately, commit publicly. Su una decisione operativa, se ho disaccordo, lo porto in 1:1 con dati e options. Se la decisione finale è diversa dalla mia, la eseguo a piena velocità — ma scrivo un memo che documenta il mio dissent. Se in 6 mesi i fatti danno torto al founder, riapro la conversation con dati, non con 'te l'avevo detto'. Esempio: con il mio ex-CEO eravamo in disaccordo su scelta di stack. Ho perso quel round, abbiamo costruito su stack X, è andata male, ho riproposto stack Y con dati. Switch fatto. Nessuno ha perso la faccia.",
    pitfalls: [
      "Dire 'non ho mai avuto conflitti'",
      "Cedere subito su tutto",
      "Combattere ogni decisione pubblicamente",
    ],
  },
  {
    id: "first_90_days",
    category: "first_90_days",
    question: "Cosa farebbe nei primi 30 / 60 / 90 giorni?",
    whatTheyEvaluate:
      "Operational thinking, capacità di prioritizzare in chaos, conoscenza pratica del ruolo.",
    framework:
      "30 giorni: learn → 60 giorni: build → 90 giorni: ship + signal.",
    sampleAnswer:
      "Giorno 1-30: ascolto. Tutti gli stakeholder principali — founder, top customer se ce ne sono, lead engineers. Audit dello stack tecnico e identificazione dei 3 bottleneck più costosi. Niente cambiamenti irreversibili. Giorno 30-60: shipping reali. Risolvo i 3 bottleneck più alto-impatto, allineando ogni risoluzione a una metrica di business (revenue, retention, velocity). In parallelo: scrivo il piano dei prossimi 6 mesi con metriche misurabili. Giorno 60-90: signal mode. Un milestone significativo pubblico (es. una integration AI che cambia un KPI), e il piano hiring del team per i prossimi 12 mesi pronto da eseguire.",
    pitfalls: [
      "Dire 'ascolto e imparo per 90 giorni' (troppo passivo)",
      "Cambiare tutto nelle prime 2 settimane (troppo aggressivo)",
      "Piano generico senza metriche",
    ],
  },
];

export function questionsByCategory() {
  const out: Record<string, InterviewQuestion[]> = {};
  for (const q of FOUNDER_INTERVIEW_QUESTIONS) {
    if (!out[q.category]) out[q.category] = [];
    out[q.category].push(q);
  }
  return out;
}
