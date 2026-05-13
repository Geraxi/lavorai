import type { CompanyStageInfo } from "../types";

/**
 * Catalogo statico degli stage di una startup. Numeri di equity e
 * stipendio sono RANGE RAGIONEVOLI per il mercato italiano/EU 2025-2026,
 * non assoluti. L'AI può rifinire caso per caso nell'Opportunity Analyzer.
 */

export const COMPANY_STAGES: CompanyStageInfo[] = [
  {
    id: "idea",
    label: "Idea stage",
    description:
      "L'azienda esiste solo come idea o pitch deck. Niente prodotto, niente clienti, spesso niente entità legale ancora costituita. Il founder cerca primi alleati per validare.",
    riskLevel: 5,
    realisticEquityRange: { min: 5, max: 25 },
    realisticSalaryRange: { min: 0, max: 1500, currency: "EUR" },
    liquidityHorizon: "7-10+ anni se mai (alta probabilità di non liquidare)",
    goodQuestionsToAsk: [
      "Hai validato la domanda con clienti paganti o solo con interviste?",
      "Quanto runway personale hai per andare avanti senza fundraising?",
      "Stai cercando un co-founder o un primo dipendente in cambio di equity?",
      "Esiste già un'entità legale o stiamo parlando di una promessa?",
      "Chi sono gli altri founder e qual è la divisione di equity attuale?",
    ],
    thingsToAvoid: [
      "Accettare un fisso ridicolo senza equity significativa scritta",
      "Lavorare a tempo pieno senza un contratto co-founder o vesting agreement",
      "Equity 'verbale' o non ancora formalizzata in tabella di capitale",
    ],
    redFlagPatterns: [
      "ti chiediamo passione",
      "il prodotto lo costruiremo insieme",
      "equity da definire più avanti",
      "appena avremo i fondi pagheremo",
    ],
  },
  {
    id: "pre_seed",
    label: "Pre-seed",
    description:
      "Round €100k-€500k da angel investor o FFF (friends/family/founders). Prototipo iniziale o MVP grezzo. Il team è 1-4 persone, spesso senza traction commerciale.",
    riskLevel: 5,
    realisticEquityRange: { min: 2, max: 10 },
    realisticSalaryRange: { min: 1500, max: 3500, currency: "EUR" },
    liquidityHorizon: "5-8 anni se exit, 90 % di probabilità di nulla",
    goodQuestionsToAsk: [
      "Qual è il post-money valuation e chi ha già investito?",
      "Cap table attuale completa? Quanto in mano ai founder vs investitori?",
      "Quanto runway in cassa oggi? Quando il prossimo round?",
      "Metriche commerciali: utenti, MRR, pilot clients?",
      "Vesting standard 4 anni con cliff 1 anno applicato a tutti incluso i founder?",
    ],
    thingsToAvoid: [
      "Equity < 1 % per un ruolo co-founder full-time",
      "Vesting senza cliff (rischio di restare con 0 % se si va via dopo 3 mesi)",
      "Non chiedere antidilution rights se sei early",
    ],
    redFlagPatterns: [
      "non abbiamo ancora un cap table formale",
      "il valore lo decideremo al prossimo round",
      "preferiamo non parlare di numeri",
    ],
  },
  {
    id: "seed",
    label: "Seed round",
    description:
      "Round €500k-€3M. Prodotto in mercato con primi clienti paganti o forte traction su utenti. Team 5-15 persone. Si sta cercando product-market fit.",
    riskLevel: 4,
    realisticEquityRange: { min: 0.5, max: 3 },
    realisticSalaryRange: { min: 3000, max: 5500, currency: "EUR" },
    liquidityHorizon: "5-7 anni, probabilità di exit moderata",
    goodQuestionsToAsk: [
      "Quali sono le metriche di product-market fit oggi (retention, NPS, growth)?",
      "Quanto del runway è già allocato in piano di assunzione?",
      "Liquidation preference dei seed: 1x non-partecipating o peggio?",
      "Stock option pool dimensionato per il prossimo anno di hiring?",
      "Acceleration clause in caso di acquisizione?",
    ],
    thingsToAvoid: [
      "Stock options senza early-exercise option (rischio tasse alte all'exercise)",
      "Strike price non chiarito → potresti dover pagare per il privilegio",
      "Accettare equity < 0.3 % se sei key-hire C-level",
    ],
    redFlagPatterns: [
      "il pool è ancora da definire",
      "lo strike price lo decide il board",
      "preferiamo non condividere il cap table",
    ],
  },
  {
    id: "series_a",
    label: "Series A",
    description:
      "Round €3M-€15M. Product-market fit raggiunto, focus su scaling commerciale. 15-60 dipendenti. Investitori istituzionali (VC) entrano nel board.",
    riskLevel: 3,
    realisticEquityRange: { min: 0.1, max: 1 },
    realisticSalaryRange: { min: 4500, max: 7500, currency: "EUR" },
    liquidityHorizon: "4-6 anni a exit / round successivo / IPO",
    goodQuestionsToAsk: [
      "Burn rate mensile e mesi di runway dopo il round?",
      "Piano di Series B: quando, valuation target, milestone da hit?",
      "RSU o stock options? In quale giurisdizione?",
      "Ho diritto a vendere parte delle azioni in eventuale secondary?",
      "Politica di refresh delle equity grant dopo i 4 anni di vesting?",
    ],
    thingsToAvoid: [
      "Non chiedere refresh grants dopo i 4 anni di cliff",
      "Sottovalutare l'impatto di future dilution rounds",
    ],
    redFlagPatterns: [
      "il pool sarà ridotto al prossimo round",
      "le condizioni dipendono dal board",
    ],
  },
  {
    id: "series_b_c",
    label: "Series B / C",
    description:
      "Round €15M-€100M+. Azienda con revenue significativa, espansione internazionale, 60-300 dipendenti. Rischio operativo basso, ma upside di equity più diluito.",
    riskLevel: 2,
    realisticEquityRange: { min: 0.05, max: 0.4 },
    realisticSalaryRange: { min: 6000, max: 11000, currency: "EUR" },
    liquidityHorizon: "3-5 anni: exit, IPO o secondary tender",
    goodQuestionsToAsk: [
      "Esiste un programma di tender / secondary sales per dipendenti?",
      "Cosa succede agli unvested se l'azienda viene acquisita?",
      "Refresh policy dopo i 4 anni: quanto, quando?",
      "Lock-up post-IPO previsto: 6 mesi o 12?",
    ],
    thingsToAvoid: [
      "Sopravvalutare l'equity senza considerare la dilution dei prossimi round",
      "Non chiedere acceleration in caso di change-of-control",
    ],
    redFlagPatterns: [],
  },
  {
    id: "pre_ipo",
    label: "Pre-IPO",
    description:
      "Late-stage growth equity, valuation €1B+. Preparazione IPO entro 12-24 mesi. Comp competitive, equity più liquide via tender ricorrenti.",
    riskLevel: 2,
    realisticEquityRange: { min: 0.01, max: 0.15 },
    realisticSalaryRange: { min: 7000, max: 14000, currency: "EUR" },
    liquidityHorizon: "1-3 anni a IPO",
    goodQuestionsToAsk: [
      "Quando l'IPO target e in quale exchange?",
      "Lock-up post-IPO: durata e condizioni?",
      "Tender offer recenti: prezzo e frequenza?",
      "RSU performance-vested o time-vested?",
    ],
    thingsToAvoid: [
      "Sottovalutare le tasse al vesting RSU (income tax piena)",
      "Non capire i lock-up restrictions",
    ],
    redFlagPatterns: ["IPO continuamente rinviato senza date chiare"],
  },
  {
    id: "ipo_exit",
    label: "IPO / Post-exit",
    description:
      "Azienda quotata pubblicamente o appena acquisita. Equity = RSU su azioni liquide. Rischio finanziario minimo, upside contenuto.",
    riskLevel: 1,
    realisticEquityRange: { min: 0.005, max: 0.08 },
    realisticSalaryRange: { min: 7500, max: 16000, currency: "EUR" },
    liquidityHorizon: "Trimestri di vesting → liquidità immediata",
    goodQuestionsToAsk: [
      "RSU vesting schedule e blackout periods?",
      "Performance shares: criteri di assegnazione?",
      "ESPP (employee stock purchase plan) attivo?",
    ],
    thingsToAvoid: ["Equity overstated come '0.1 % del valore d'azienda' invece di RSU number"],
    redFlagPatterns: [],
  },
];

export function getStageById(id: string): CompanyStageInfo | undefined {
  return COMPANY_STAGES.find((s) => s.id === id);
}
