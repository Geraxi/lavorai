import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  runInterviewTurn,
  type TurnMessage,
} from "@/lib/interview-buddy";

export const runtime = "nodejs";
export const maxDuration = 30;

const FREE_LIMIT = 3;
const FREE_COOKIE = "lavorai_interview_count";

const Schema = z.object({
  context: z.object({
    jobDescription: z.string().max(8000).optional(),
    role: z.string().max(200).optional(),
    company: z.string().max(200).optional(),
    locale: z.enum(["it", "en"]),
  }),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
      }),
    )
    .max(20),
});

/**
 * POST /api/interview-buddy/turn
 *
 * Esegue un turno del mock interview. Stateless: il client manda
 * l'intera conversation history a ogni request. Server è un thin
 * wrapper attorno a Claude Sonnet.
 *
 * Free tier:
 *  - 3 sessioni complete senza signup (tracciato via cookie)
 *  - Una "sessione" = un'history che parte da 0 turni
 *  - Quando il client riparte da history vuota, incrementiamo il counter
 *  - Al 4° tentativo di start → 402 Payment Required + redirect signup
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Body non parsabile." },
      { status: 400 },
    );
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation",
        message: "Input invalido.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { context, history } = parsed.data;

  // Free quota check: incrementiamo solo all'INIZIO di una sessione
  // (history vuota). Turni successivi nello stesso flow non costano
  // un "credito" — il credito si paga per kickoff.
  const isSessionStart = history.length === 0;
  let count = 0;
  const cookieRaw = request.cookies.get(FREE_COOKIE)?.value;
  if (cookieRaw) {
    const n = Number(cookieRaw);
    if (Number.isFinite(n) && n >= 0) count = n;
  }

  if (isSessionStart && count >= FREE_LIMIT) {
    return NextResponse.json(
      {
        error: "free_limit_reached",
        message:
          context.locale === "en"
            ? `You've used your ${FREE_LIMIT} free mock interviews. Sign up for unlimited.`
            : `Hai usato i ${FREE_LIMIT} mock interview gratuiti. Registrati per averne illimitati.`,
        signupUrl: "/signup?plan=pro",
      },
      { status: 402 },
    );
  }

  try {
    const result = await runInterviewTurn(
      context,
      history as TurnMessage[],
    );

    const response = NextResponse.json({
      message: result.message,
      isFinal: result.isFinal,
      questionNumber: result.questionNumber,
      freeRemaining: Math.max(0, FREE_LIMIT - count - (isSessionStart ? 1 : 0)),
    });

    if (isSessionStart) {
      response.cookies.set(FREE_COOKIE, String(count + 1), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 90, // 90gg
      });
    }

    return response;
  } catch (err) {
    console.error("[/api/interview-buddy/turn]", err);
    return NextResponse.json(
      {
        error: "internal",
        message:
          context.locale === "en"
            ? "Something went wrong. Please retry in a moment."
            : "Qualcosa è andato storto. Riprova tra un attimo.",
      },
      { status: 500 },
    );
  }
}
