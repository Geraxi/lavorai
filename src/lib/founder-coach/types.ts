/**
 * Founder Interview Coach — type system.
 *
 * Tutte le entità del modulo. Mantenute in un solo file per evitare
 * dipendenze circolari e dare un colpo d'occhio totale del dominio.
 */

/* ============================================================
 * Company classification
 * ============================================================ */

export type CompanyType =
  | "startup"
  | "venture_studio"
  | "accelerator"
  | "scaleup"
  | "corporate"
  | "agency"
  | "unknown";

export type CompanyStage =
  | "idea"
  | "pre_seed"
  | "seed"
  | "series_a"
  | "series_b_c"
  | "pre_ipo"
  | "ipo_exit";

export interface CompanyStageInfo {
  id: CompanyStage;
  label: string;
  description: string;
  riskLevel: 1 | 2 | 3 | 4 | 5; // 1 = basso, 5 = altissimo
  realisticEquityRange: { min: number; max: number }; // %
  realisticSalaryRange: { min: number; max: number; currency: "EUR" | "USD" };
  liquidityHorizon: string; // es. "5-10 anni, se exit"
  goodQuestionsToAsk: string[];
  thingsToAvoid: string[];
  redFlagPatterns: string[];
}

/* ============================================================
 * Equity & comp
 * ============================================================ */

export type EquityType =
  | "real_shares"
  | "stock_options"
  | "phantom_equity"
  | "rsu"
  | "sweat_equity"
  | "unclear";

export interface EquityTerm {
  id: string;
  term: string;
  definitionSimple: string; // 2-3 righe italiano semplice
  whenToUse: string;
  sampleSentence: string; // frase pronta in italiano
  commonMistake: string;
  category: "compensation" | "vesting" | "governance" | "exit" | "valuation" | "business";
}

/* ============================================================
 * Opportunity Analyzer (Feature A)
 * ============================================================ */

export interface OpportunityInput {
  companyName: string;
  roleTitle: string;
  /** Job description, email ricevuta, o qualunque testo che descrive l'opportunità */
  rawContext: string;
  companyUrl?: string;
  /** CV testo o riassunto. Se vuoto, l'AI lavora senza ancorarsi al candidato. */
  cvSummary?: string;
  /** Obiettivo personale: "ottenere offerta", "esplorare", "negoziare leva", ... */
  personalGoal?: string;
  /** Vincoli espliciti: full-time / part-time, stipendio min, equity desiderata */
  constraints?: {
    commitment?: "full_time" | "part_time" | "flexible";
    minMonthlySalary?: number; // EUR
    desiredEquityPct?: number; // %
    keepCurrentJob?: boolean;
    personalProjects?: boolean;
  };
}

export interface OpportunityAnalysis {
  summary: string; // sintesi 2-3 frasi
  companyType: CompanyType;
  estimatedStage: CompanyStage;
  stageConfidence: "high" | "medium" | "low";
  redFlags: AnalysisFlag[];
  greenFlags: AnalysisFlag[];
  questionsToAsk: string[];
  thingsToNegotiate: string[];
  strategy: string; // paragrafo strategy in italiano
  /** Score 1-10: 1 = scappa, 10 = opportunità eccezionale */
  riskOpportunityScore: number;
  /** Cosa potrebbe rendere questo punteggio più alto/basso */
  scoreRationale: string;
}

export interface AnalysisFlag {
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
}

/* ============================================================
 * Interview questions (Feature D)
 * ============================================================ */

export type InterviewQuestionCategory =
  | "intro"
  | "motivation"
  | "ai_experience"
  | "leadership"
  | "decision_making"
  | "compensation"
  | "vision"
  | "conflict"
  | "first_90_days"
  | "uncertainty";

export interface InterviewQuestion {
  id: string;
  category: InterviewQuestionCategory;
  question: string;
  /** Cosa l'intervistatore sta davvero valutando. Meta-segnale per il candidato. */
  whatTheyEvaluate: string;
  /** Framework di risposta (STAR, signal-noise, etc.) */
  framework: string;
  /** Risposta esempio in italiano professionale, founder-level */
  sampleAnswer: string;
  /** Anti-pattern: cosa NON dire */
  pitfalls: string[];
}

/* ============================================================
 * Negotiation (Feature E)
 * ============================================================ */

export type NegotiationScenarioId =
  | "salary_4k_equity_5"
  | "salary_5k_equity_2_3"
  | "lower_salary_higher_equity"
  | "flexible_initial_phase"
  | "ai_subscriptions"
  | "clarify_commitment"
  | "personal_projects"
  | "investment_in_own_projects";

export interface NegotiationScenario {
  id: NegotiationScenarioId;
  title: string;
  context: string; // quando usarlo
  script: string; // frase principale da pronunciare
  followUpVariants: string[]; // 2-3 varianti per la negoziazione
  bridgeIfPushback: string; // cosa rispondere se l'altro dice no
  tone: "diretto" | "esplorativo" | "fermo";
}

/* ============================================================
 * Vocabulary trainer (Feature F)
 * ============================================================ */

export interface FounderVocabularyTerm {
  id: string;
  term: string; // "Vesting"
  category:
    | "ownership"
    | "compensation"
    | "valuation"
    | "operations"
    | "go_to_market"
    | "exit"
    | "strategy";
  /** Definizione semplice italiana, max 2 frasi */
  definitionSimple: string;
  /** Quando usarla in una call */
  whenToUse: string;
  /** Frase pronta da pronunciare */
  readyPhrase: string;
  /** Errore comune da evitare */
  commonMistake: string;
}

/* ============================================================
 * Strategy output (generic envelope for AI responses)
 * ============================================================ */

export interface StrategyOutput {
  headline: string;
  bullets: string[];
  callToAction?: string;
  warnings?: string[];
}
