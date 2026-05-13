import Anthropic from "@anthropic-ai/sdk";
import type {
  OpportunityInput,
  OpportunityAnalysis,
  CompanyStage,
  CompanyType,
} from "./types";
import { COMPANY_STAGES } from "./data/stages";

/**
 * Opportunity Analyzer — Claude-powered.
 *
 * Mix di rule-based (stage hints da keyword) + Claude generation
 * (red/green flags, strategia, score). Output strutturato JSON.
 */

const MODEL = "claude-sonnet-4-20250514";

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");
  cachedClient = new Anthropic({ apiKey: key });
  return cachedClient;
}

export async function analyzeOpportunity(
  input: OpportunityInput,
): Promise<OpportunityAnalysis> {
  // Pre-stage hints rule-based: scan keywords nel rawContext per
  // dare un anchor a Claude (riduce hallucination dello stage).
  const stageHints = detectStageHints(input.rawContext + " " + (input.companyUrl ?? ""));
  const typeHints = detectTypeHints(input.rawContext);

  const client = getClient();
  const system = buildSystemPrompt();
  const userPrompt = buildUserPrompt(input, stageHints, typeHints);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2200,
    temperature: 0.4,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");

  return parseAnalysis(text);
}

function detectStageHints(text: string): CompanyStage[] {
  const t = text.toLowerCase();
  const hits: CompanyStage[] = [];
  if (/\b(idea stage|pre.?seed|founder looking|just an idea)\b/.test(t)) hits.push("pre_seed");
  if (/\b(seed round|seed.?funded|series seed)\b/.test(t)) hits.push("seed");
  if (/\b(series a|post.?seed)\b/.test(t)) hits.push("series_a");
  if (/\b(series b|series c|growth equity|scale.?up)\b/.test(t)) hits.push("series_b_c");
  if (/\b(pre.?ipo|tender offer|secondary sale)\b/.test(t)) hits.push("pre_ipo");
  if (/\b(ipo|public company|nasdaq|nyse|listed)\b/.test(t)) hits.push("ipo_exit");
  return hits;
}

function detectTypeHints(text: string): CompanyType[] {
  const t = text.toLowerCase();
  const hits: CompanyType[] = [];
  if (/\bventure studio|venture builder|company builder\b/.test(t)) hits.push("venture_studio");
  if (/\baccelerator|incubator|y.?combinator|techstars\b/.test(t)) hits.push("accelerator");
  if (/\b(startup|early.?stage|early stage)\b/.test(t)) hits.push("startup");
  if (/\b(scale.?up|scaleup|unicorn|decacorn)\b/.test(t)) hits.push("scaleup");
  if (/\b(corporate|enterprise|fortune \d+|multinational)\b/.test(t)) hits.push("corporate");
  if (/\b(agency|consulting firm|consultancy)\b/.test(t)) hits.push("agency");
  return hits;
}

function buildSystemPrompt(): string {
  const stageRefs = COMPANY_STAGES.map(
    (s) =>
      `- ${s.id} (${s.label}): rischio ${s.riskLevel}/5, equity tipica ${s.realisticEquityRange.min}-${s.realisticEquityRange.max}%, salario €${s.realisticSalaryRange.min}-${s.realisticSalaryRange.max}/mese.`,
  ).join("\n");

  return `Sei "Founder Interview Coach", un advisor senior che valuta opportunità lavorative founder-level (CTO, Tech Co-founder, Founding Engineer, AI Builder, Venture Studio roles).

Hai 15+ anni di esperienza in mercato VC EU/US 2010-2026 e hai visto centinaia di term sheet, cap table, term di co-founder agreement. Sei diretto, basato su dati, no-bullshit. Italiano professionale.

REFERENCE per stage (numeri di benchmark, NON assoluti — vanno calibrati sul context):
${stageRefs}

REGOLE DI OUTPUT (rispettare alla lettera):
1. Solo JSON puro come output. NIENTE markdown, NIENTE testo prima/dopo, NIENTE \`\`\`json fence.
2. Schema esatto:
   {
     "summary": "2-3 frasi sintetiche dell'opportunità",
     "companyType": "startup" | "venture_studio" | "accelerator" | "scaleup" | "corporate" | "agency" | "unknown",
     "estimatedStage": "idea" | "pre_seed" | "seed" | "series_a" | "series_b_c" | "pre_ipo" | "ipo_exit",
     "stageConfidence": "high" | "medium" | "low",
     "redFlags": [{"severity":"low|medium|high","title":"...","detail":"1-2 frasi"}],
     "greenFlags": [{"severity":"low|medium|high","title":"...","detail":"1-2 frasi"}],
     "questionsToAsk": ["domanda concreta da fare in call 1","domanda 2", ...] (5-8 elementi),
     "thingsToNegotiate": ["voce 1","voce 2", ...] (4-7 elementi),
     "strategy": "paragrafo 4-6 frasi con consigli concreti next step",
     "riskOpportunityScore": 1-10 (1=scappa, 10=opportunità eccezionale),
     "scoreRationale": "1-2 frasi che spiegano lo score"
   }
3. Sii SCEPTICAL. Le startup early-stage sono rischio default. Per dare uno score >7 servono evidenze chiare (team, mercato, traction, term).
4. Identifica "fake co-founder" patterns: equity vago, no cap table, "lo decideremo dopo", asimmetrie founder vs nuovo entrante, vesting senza cliff per nuovo entrante mentre founder hanno 0 cliff.
5. Equity proposte: confronta col range dello stage. Se sotto, FLAG. Se sopra, è sospetta (perché regalano tanto?).
6. Le tue red/greenFlags devono essere SPECIFICHE al contesto dato, non generiche.`;
}

function buildUserPrompt(
  input: OpportunityInput,
  stageHints: CompanyStage[],
  typeHints: CompanyType[],
): string {
  const constraintsText = input.constraints
    ? `\n\nVINCOLI DEL CANDIDATO:
- Commitment: ${input.constraints.commitment ?? "non specificato"}
- Stipendio minimo: ${input.constraints.minMonthlySalary ? `€${input.constraints.minMonthlySalary}/mese` : "non specificato"}
- Equity desiderata: ${input.constraints.desiredEquityPct ? `${input.constraints.desiredEquityPct}%` : "non specificata"}
- Mantenere lavoro attuale: ${input.constraints.keepCurrentJob ? "sì" : "no"}
- Progetti personali da preservare: ${input.constraints.personalProjects ? "sì" : "no"}`
    : "";
  return `OPPORTUNITÀ DA ANALIZZARE

Azienda: ${input.companyName}
Ruolo: ${input.roleTitle}
${input.companyUrl ? `Link: ${input.companyUrl}` : ""}

CONTESTO RAW (job description / email / pitch / quello che il candidato ha):
"""
${input.rawContext.slice(0, 6000)}
"""
${
  input.cvSummary
    ? `\nCV / PROFILO CANDIDATO:\n"""\n${input.cvSummary.slice(0, 1500)}\n"""`
    : ""
}
${input.personalGoal ? `\nOBIETTIVO PERSONALE: ${input.personalGoal}` : ""}${constraintsText}

HINT da keyword detection rule-based (usa come prior, ma valuta tu):
- Stage detection: ${stageHints.length > 0 ? stageHints.join(", ") : "nessun match diretto"}
- Type detection: ${typeHints.length > 0 ? typeHints.join(", ") : "nessun match diretto"}

Genera l'analisi JSON come da schema definito nel system prompt.`;
}

function parseAnalysis(text: string): OpportunityAnalysis {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    const p = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      summary: typeof p.summary === "string" ? p.summary : "",
      companyType:
        typeof p.companyType === "string"
          ? (p.companyType as CompanyType)
          : "unknown",
      estimatedStage:
        typeof p.estimatedStage === "string"
          ? (p.estimatedStage as CompanyStage)
          : "seed",
      stageConfidence:
        p.stageConfidence === "high" ||
        p.stageConfidence === "medium" ||
        p.stageConfidence === "low"
          ? p.stageConfidence
          : "medium",
      redFlags: Array.isArray(p.redFlags)
        ? (p.redFlags as OpportunityAnalysis["redFlags"])
        : [],
      greenFlags: Array.isArray(p.greenFlags)
        ? (p.greenFlags as OpportunityAnalysis["greenFlags"])
        : [],
      questionsToAsk: Array.isArray(p.questionsToAsk)
        ? p.questionsToAsk.filter((x): x is string => typeof x === "string")
        : [],
      thingsToNegotiate: Array.isArray(p.thingsToNegotiate)
        ? p.thingsToNegotiate.filter(
            (x): x is string => typeof x === "string",
          )
        : [],
      strategy: typeof p.strategy === "string" ? p.strategy : "",
      riskOpportunityScore:
        typeof p.riskOpportunityScore === "number"
          ? Math.max(1, Math.min(10, Math.round(p.riskOpportunityScore)))
          : 5,
      scoreRationale:
        typeof p.scoreRationale === "string" ? p.scoreRationale : "",
    };
  } catch {
    // Fallback minimo: ritorna l'output come summary
    return {
      summary: cleaned.slice(0, 600),
      companyType: "unknown",
      estimatedStage: "seed",
      stageConfidence: "low",
      redFlags: [],
      greenFlags: [],
      questionsToAsk: [],
      thingsToNegotiate: [],
      strategy: "Output AI non parsabile, riprova.",
      riskOpportunityScore: 5,
      scoreRationale: "Errore parsing output AI.",
    };
  }
}
