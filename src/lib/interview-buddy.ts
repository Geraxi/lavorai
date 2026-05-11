import Anthropic from "@anthropic-ai/sdk";

/**
 * Interview Buddy — mock interview AI-driven, text-based.
 *
 * Architettura:
 *   - Stateless server: il client manda l'intera history a ogni turn
 *   - 5 domande totali per sessione (q1: 1 warmup, q2-4: 3 behavioral
 *     STAR, q5: 1 deep-skill tecnico/role-specific)
 *   - Dopo l'ultima risposta, summary finale con score + 3 strenghts
 *     + 3 improvements
 *
 * Locale-aware: prompt in italiano se l'utente è in IT, in inglese
 * altrimenti. La cover letter è già locale-aware via JD detection,
 * qui usiamo esplicitamente il locale del visitor.
 */

const MODEL = "claude-sonnet-4-20250514";

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY missing");
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

export interface TurnMessage {
  role: "user" | "assistant";
  content: string;
}

export interface InterviewContext {
  /** Job description completo (preferito) o role + company manuale. */
  jobDescription?: string;
  role?: string;
  company?: string;
  /** "it" | "en" — determina lingua del feedback. */
  locale: "it" | "en";
}

export interface TurnResult {
  /** Risposta dell'AI: feedback breve sulla risposta precedente + prossima domanda
   *  (se non è l'ultima). Se è l'ultima, contiene il summary finale. */
  message: string;
  /** True se la sessione è finita (dopo 5 risposte utente → summary). */
  isFinal: boolean;
  /** Numero domanda corrente (1-5). Per la progress bar lato client. */
  questionNumber: number;
}

const SYSTEM_PROMPT_IT = `Sei un Interview Buddy — un coach AI esperto in colloqui di lavoro per il mercato italiano + EU. Conduci un mock interview di 5 domande basato su un annuncio reale.

REGOLE:
1. Le domande sono SU MISURA dell'annuncio: q1 warmup ("parlami di te" contestualizzato), q2-3 behavioral STAR (situational, comportamentali), q4 deep-skill (tecnica o competenza chiave dall'annuncio), q5 reverse ("hai domande per me?").
2. Una domanda alla volta. Niente domande multiple in un turn.
3. Dopo OGNI risposta dell'utente, fornisci:
   - feedback breve (2-3 frasi): cosa è andato bene + cosa migliorare
   - poi la domanda successiva
4. Feedback deve essere SPECIFICO. NO frasi vaghe tipo "buon punto". USA citazioni dalla risposta dell'utente.
5. Tono: diretto, supportivo, professionale. Niente hype, niente vague AI-speak.
6. Lingua: italiano per tutto (domande, feedback).
7. Alla 5a risposta dell'utente, NON fare un'altra domanda. Invece dai un SUMMARY FINALE strutturato così:
   - **Score complessivo**: X/100 (sii rigoroso, no inflation)
   - **3 punti di forza** (concreti, citando esempi)
   - **3 aree da migliorare** (con suggerimento attivabile)
   - **1 frase pratica** che l'utente porta via per il prossimo colloquio reale

FORMATO output:
- Niente markdown heavy. Usa **bold** solo per i label sopra.
- Frasi brevi. Niente fillers.`;

const SYSTEM_PROMPT_EN = `You are an Interview Buddy — an AI coach expert in job interviews for the EU + international markets. Run a 5-question mock interview based on a real job posting.

RULES:
1. Questions are tailored to the posting: q1 warmup ("tell me about yourself" contextualized), q2-3 behavioral STAR, q4 deep-skill (technical or key competency from the listing), q5 reverse ("any questions for me?").
2. One question per turn. Never multiple questions at once.
3. After EVERY user answer, provide:
   - brief feedback (2-3 sentences): what went well + what to improve
   - then the next question
4. Feedback must be SPECIFIC. NO vague phrases like "good point". QUOTE from the user's answer.
5. Tone: direct, supportive, professional. No hype, no vague AI-speak.
6. Language: English for everything (questions, feedback).
7. On the 5th user answer, DO NOT ask another question. Instead provide a FINAL SUMMARY structured as:
   - **Overall score**: X/100 (be rigorous, no inflation)
   - **3 strengths** (concrete, citing examples)
   - **3 areas to improve** (with an actionable suggestion)
   - **1 practical takeaway** for the user's next real interview

OUTPUT FORMAT:
- No heavy markdown. Use **bold** only for labels above.
- Short sentences. No filler.`;

/**
 * Esegue un turno del mock interview.
 *  - history vuota → primo turno: AI introduce e fa q1
 *  - history con N turni utente → AI dà feedback su ultima risposta + q(N+1)
 *  - history con 5 risposte utente → AI dà summary finale
 */
export async function runInterviewTurn(
  context: InterviewContext,
  history: TurnMessage[],
): Promise<TurnResult> {
  const client = getClient();
  const system =
    context.locale === "en" ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_IT;

  // Conta quante risposte ha già dato l'utente (= n turni "user" in history)
  const userTurns = history.filter((m) => m.role === "user").length;
  const isFinalTurn = userTurns === 5;
  const questionNumber = Math.min(5, userTurns + 1);

  // System suffix con contesto sul job posting
  const jobContext = buildJobContextBlock(context);

  // Messages: history client + opzionale instruction per il turn corrente
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  if (history.length === 0) {
    // Primo turno: inserisci una user message implicita per kickstart
    messages.push({
      role: "user",
      content:
        context.locale === "en"
          ? `Start the interview. Begin with a brief intro (1 sentence) + the first question.`
          : `Inizia il colloquio. Comincia con una breve intro (1 frase) + la prima domanda.`,
    });
  } else {
    // Pass-through dell'history client
    messages.push(...history);
    // Se è l'ultimo turn, aggiungi instruction esplicita per il summary
    if (isFinalTurn) {
      messages.push({
        role: "user",
        content:
          context.locale === "en"
            ? `That was my 5th answer. Now give me the final SUMMARY (score + 3 strengths + 3 improvements + 1 takeaway). Don't ask more questions.`
            : `Questa era la mia 5a risposta. Ora dammi il SUMMARY FINALE (score + 3 punti di forza + 3 aree da migliorare + 1 frase pratica). Non fare altre domande.`,
      });
    }
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: isFinalTurn ? 1200 : 600,
    system: [
      {
        type: "text",
        text: system + "\n\n" + jobContext,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
  });

  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  return {
    message: text,
    isFinal: isFinalTurn,
    questionNumber,
  };
}

function buildJobContextBlock(ctx: InterviewContext): string {
  const lines: string[] = ["=== JOB POSTING CONTEXT ==="];
  if (ctx.role) lines.push(`Role: ${ctx.role}`);
  if (ctx.company) lines.push(`Company: ${ctx.company}`);
  if (ctx.jobDescription) {
    // Limit JD to ~3k chars to keep prompt budget reasonable
    const truncated = ctx.jobDescription.slice(0, 3000);
    lines.push("", "Job description:", truncated);
  } else if (!ctx.role && !ctx.company) {
    lines.push(
      ctx.locale === "en"
        ? "No specific posting provided. Run a generic mid-level professional interview."
        : "Nessun annuncio fornito. Conduci un colloquio generico mid-level professionale.",
    );
  }
  return lines.join("\n");
}
