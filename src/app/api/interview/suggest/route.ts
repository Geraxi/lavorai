import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { guardPremiumAPI } from "@/lib/premium-gate";
import { suggestAnswer, type CopilotContext } from "@/lib/interview-copilot";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/interview/suggest
 *
 * Body: { applicationId: string, question: string }
 *
 * Carica:
 *   - Application + Job (contesto job)
 *   - InterviewSession.briefJson (contesto utente)
 *   - User CVProfile (esperienze, ruoli, skill)
 *   - InterviewSession.copilotLogJsonl (conversazione corrente)
 *
 * Chiama Claude → genera risposta strutturata { headline, bullets,
 * speakingNote, latencyMs }. Appende il turn al log.
 */
export async function POST(request: NextRequest) {
  const gate = await guardPremiumAPI("interview_copilot");
  if (gate.error) return gate.error;
  const user = gate.user;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const applicationId =
    typeof body.applicationId === "string" ? body.applicationId : "";
  const question =
    typeof body.question === "string" ? body.question.trim() : "";
  if (!applicationId || !question) {
    return NextResponse.json(
      { error: "missing_params", message: "applicationId e question sono obbligatori." },
      { status: 400 },
    );
  }
  if (question.length > 1500) {
    return NextResponse.json(
      { error: "question_too_long", message: "Domanda troppo lunga (max 1500 char)." },
      { status: 400 },
    );
  }

  // Carica tutto il contesto in un colpo solo.
  const session = await prisma.interviewSession.findFirst({
    where: { applicationId, userId: user.id },
    include: {
      application: {
        select: {
          job: {
            select: {
              title: true,
              company: true,
              description: true,
            },
          },
        },
      },
    },
  });
  if (!session) {
    return NextResponse.json(
      { error: "no_session", message: "Crea prima un brief in /interview/prep." },
      { status: 404 },
    );
  }

  // Brief
  let brief = {
    goal: "offer",
    expectedRound: "hr",
    stressLevel: 3,
    weakAreas: [] as string[],
    strengths: [] as string[],
    customNotes: "",
  };
  if (session.briefJson) {
    try {
      const parsed = JSON.parse(session.briefJson);
      brief = { ...brief, ...parsed };
    } catch {
      /* noop */
    }
  }

  // CV summary: pesca i campi rilevanti del CVProfile (lo schema usa
  // colonne separate per sezione, non un blob JSON unico).
  const profile = await prisma.cVProfile.findUnique({
    where: { userId: user.id },
    select: {
      title: true,
      summary: true,
      experiencesJson: true,
      skillsJson: true,
    },
  });
  let cvSummary = "";
  if (profile) {
    const parts: string[] = [];
    if (profile.title) parts.push(`Headline: ${profile.title}`);
    if (profile.summary) parts.push(`Summary: ${profile.summary}`);
    try {
      const exps = JSON.parse(profile.experiencesJson) as unknown;
      if (Array.isArray(exps)) {
        for (const exp of exps.slice(0, 6) as Array<Record<string, unknown>>) {
          const role = typeof exp.role === "string" ? exp.role : "";
          const company = typeof exp.company === "string" ? exp.company : "";
          const desc = typeof exp.description === "string" ? exp.description : "";
          parts.push(`- ${role} @ ${company}: ${desc.slice(0, 220)}`);
        }
      }
    } catch {
      /* experiencesJson malformato */
    }
    try {
      const skills = JSON.parse(profile.skillsJson) as unknown;
      if (Array.isArray(skills) && skills.length > 0) {
        parts.push(`Skills: ${skills.slice(0, 20).join(", ")}`);
      }
    } catch {
      /* noop */
    }
    cvSummary = parts.join("\n").slice(0, 1800);
  }

  // Conversation history
  const conversationSoFar: Array<{ question: string; suggestion: string }> = [];
  if (session.copilotLogJsonl) {
    const lines = session.copilotLogJsonl.split("\n").filter(Boolean);
    for (const line of lines.slice(-8)) {
      try {
        const entry = JSON.parse(line);
        if (entry.question && entry.suggestion) {
          conversationSoFar.push({
            question: entry.question,
            suggestion:
              typeof entry.suggestion === "string"
                ? entry.suggestion
                : JSON.stringify(entry.suggestion),
          });
        }
      } catch {
        /* noop */
      }
    }
  }

  const ctx: CopilotContext = {
    jobTitle: session.application.job.title,
    company: session.application.job.company ?? "",
    jobDescription: session.application.job.description ?? "",
    brief,
    cvSummary,
    conversationSoFar,
  };

  let suggestion;
  try {
    suggestion = await suggestAnswer(ctx, question);
  } catch (err) {
    console.error("[copilot] suggestAnswer failed", err);
    return NextResponse.json(
      {
        error: "ai_error",
        message: err instanceof Error ? err.message : "AI provider error",
      },
      { status: 500 },
    );
  }

  // Append turn to log
  const turn = {
    ts: new Date().toISOString(),
    question,
    suggestion: {
      headline: suggestion.headline,
      bullets: suggestion.bullets,
      speakingNote: suggestion.speakingNote,
    },
    model: "claude-sonnet-4-20250514",
    latencyMs: suggestion.latencyMs,
  };
  const newLog =
    (session.copilotLogJsonl ?? "") +
    (session.copilotLogJsonl ? "\n" : "") +
    JSON.stringify(turn);
  await prisma.interviewSession.update({
    where: { id: session.id },
    data: {
      copilotLogJsonl: newLog,
      startedAt: session.startedAt ?? new Date(),
    },
  });

  return NextResponse.json({ ok: true, suggestion });
}
