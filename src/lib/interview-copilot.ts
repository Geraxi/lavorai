import Anthropic from "@anthropic-ai/sdk";

/**
 * Interview Copilot — risposta in <2s a una domanda dell'intervistatore.
 *
 * Differenza dal /interview-buddy (mock interview):
 *   - Buddy genera DOMANDE simulate per esercizio
 *   - Copilot riceve la domanda REALE in tempo reale durante la call
 *     e genera una risposta da pronunciare ad alta voce, ancorata al
 *     CV dell'utente + JD del job + brief di preparazione.
 *
 * Vincoli:
 *   - Latenza obiettivo <2s end-to-end → no thinking tokens long, max_tokens
 *     limitato (250), modello Sonnet veloce.
 *   - Output strutturato fisso per UI snappy:
 *       { headline, bullets: string[], speakingNote: string }
 */

const MODEL = "claude-sonnet-4-20250514";

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

export interface CopilotContext {
  /** Titolo del job */
  jobTitle: string;
  /** Azienda */
  company: string;
  /** Descrizione del job (può essere ricca o vuota) */
  jobDescription: string;
  /** Brief di preparazione dall'onboarding */
  brief: {
    goal: string;
    expectedRound: string;
    stressLevel: number;
    weakAreas: string[];
    strengths: string[];
    customNotes: string;
  };
  /** Riassunto CV dell'utente (max 1500 char). Pulled from CVProfile. */
  cvSummary: string;
  /** Domande/risposte già accumulate in questa call (per coerenza tra
   *  risposte successive — l'AI sa di cosa hai già parlato). */
  conversationSoFar: Array<{ question: string; suggestion: string }>;
}

export interface CopilotSuggestion {
  headline: string;
  bullets: string[];
  speakingNote: string;
  latencyMs: number;
}

/**
 * Genera una risposta strutturata a una singola domanda dell'intervistatore.
 */
export async function suggestAnswer(
  ctx: CopilotContext,
  question: string,
): Promise<CopilotSuggestion> {
  const client = getClient();
  const t0 = Date.now();

  const system = buildSystemPrompt(ctx);
  const userPrompt = buildUserPrompt(ctx, question);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 350,
    temperature: 0.4,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = parseSuggestion(text);
  return { ...parsed, latencyMs: Date.now() - t0 };
}

function buildSystemPrompt(ctx: CopilotContext): string {
  const goalText: Record<string, string> = {
    offer: "obiettivo: ottenere un'offerta concreta",
    explore: "obiettivo: capire l'azienda e il team",
    challenge: "obiettivo: tenersi in allenamento",
    negotiate: "obiettivo: usare questo colloquio come leva su un'offerta in corso",
  };
  const roundText: Record<string, string> = {
    hr: "round HR screening (motivazione + cultural fit + base tecnica)",
    technical: "round tecnico (case study, system design, coding)",
    behavioral: "round behavioral con hiring manager (STAR, leadership)",
    final: "final round / on-site (mix di tutto)",
  };

  return `Sei l'Interview Copilot di un candidato che si sta candidando a "${ctx.jobTitle}" presso ${ctx.company}.

Il candidato è in una call LIVE. Il tuo compito: data UNA domanda dell'intervistatore, generare in <2 secondi una risposta da pronunciare ad alta voce.

Contesto:
- Tipo di round: ${roundText[ctx.brief.expectedRound] ?? ctx.brief.expectedRound}
- Obiettivo del candidato: ${goalText[ctx.brief.goal] ?? ctx.brief.goal}
- Livello di stress: ${ctx.brief.stressLevel}/5
${ctx.brief.weakAreas.length > 0 ? `- Aree di preoccupazione: ${ctx.brief.weakAreas.join("; ")}` : ""}
${ctx.brief.strengths.length > 0 ? `- Punti di forza da valorizzare: ${ctx.brief.strengths.join("; ")}` : ""}
${ctx.brief.customNotes ? `- Note personali: ${ctx.brief.customNotes}` : ""}

REGOLE DI OUTPUT (rispettare alla lettera):
1. Output in JSON puro, NESSUN testo prima o dopo, NESSUN markdown fence.
2. Schema esatto:
   {
     "headline": "frase di 1 riga riassuntiva (max 90 char)",
     "bullets": ["punto 1 chiave", "punto 2", "punto 3"] (3-5 elementi, max 100 char ciascuno),
     "speakingNote": "frase di apertura DA DIRE AD ALTA VOCE, naturale, 1-2 frasi"
   }
3. La risposta è personale: usa "io ho fatto X" basandoti sul CV del candidato. NON inventare esperienze non presenti.
4. Se la domanda tocca una weak-area dichiarata, suggerisci una framing-strategy onesta, non una fuga.
5. Lingua: italiano se la domanda è in italiano, inglese altrimenti.
6. Mai disclaimer del tipo "ecco una risposta che potresti dare" — vai diretto al contenuto.`;
}

function buildUserPrompt(ctx: CopilotContext, question: string): string {
  const recap =
    ctx.conversationSoFar.length > 0
      ? `\n\nDOMANDE GIÀ TRATTATE IN QUESTA CALL (per non ripeterti):\n${ctx.conversationSoFar
          .slice(-5)
          .map((c, i) => `${i + 1}. Q: ${c.question}\n   A: ${c.suggestion.slice(0, 120)}...`)
          .join("\n")}`
      : "";
  const jdSection = ctx.jobDescription
    ? `\n\nJOB DESCRIPTION:\n${ctx.jobDescription.slice(0, 2000)}`
    : "";
  return `CV / PROFILO DEL CANDIDATO:
${ctx.cvSummary || "(non fornito)"}${jdSection}${recap}

DOMANDA DELL'INTERVISTATORE (LIVE):
"${question}"

Genera l'output JSON.`;
}

function parseSuggestion(text: string): Omit<CopilotSuggestion, "latencyMs"> {
  // Strip eventuali code fences che a volte Claude aggiunge
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      headline: typeof parsed.headline === "string" ? parsed.headline : "—",
      bullets: Array.isArray(parsed.bullets)
        ? parsed.bullets
            .filter((b): b is string => typeof b === "string")
            .slice(0, 6)
        : [],
      speakingNote:
        typeof parsed.speakingNote === "string" ? parsed.speakingNote : "",
    };
  } catch {
    // Fallback: ritorna tutto come headline se il parsing fallisce
    return {
      headline: cleaned.slice(0, 200),
      bullets: [],
      speakingNote: "",
    };
  }
}
