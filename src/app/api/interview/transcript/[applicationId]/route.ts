import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * GET /api/interview/transcript/[applicationId]?since=<ISO>
 *
 * Polling-based fetch della trascrizione live accumulata dalla Chrome
 * extension. La pagina /interview/live lo chiama ogni 1.5s e mostra
 * solo i chunk nuovi (ts > since).
 *
 * NOTA: implementato come polling (non SSE/WebSocket) per compatibilità
 * massima con Vercel Functions su Fluid Compute. Latenza ~1-2s è
 * accettabile per il use case (l'utente è in call live, non serve
 * sub-secondo). SSE potrà essere un upgrade premium.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  const { applicationId } = await params;
  const sinceParam = request.nextUrl.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : null;

  const session = await prisma.interviewSession.findFirst({
    where: { applicationId, userId: user.id },
    select: { transcriptJsonl: true },
  });
  if (!session) {
    return NextResponse.json({ chunks: [] });
  }

  const lines = (session.transcriptJsonl ?? "")
    .split("\n")
    .filter(Boolean);
  const chunks: Array<{
    ts: string;
    text: string;
    speaker: string;
    source: string;
  }> = [];
  for (const line of lines) {
    try {
      const c = JSON.parse(line);
      if (since) {
        const t = new Date(c.ts);
        if (!Number.isNaN(t.getTime()) && t <= since) continue;
      }
      chunks.push(c);
    } catch {
      /* skip malformed */
    }
  }
  return NextResponse.json({ chunks });
}
