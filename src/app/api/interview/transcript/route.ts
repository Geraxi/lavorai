import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/interview/transcript
 *
 * Endpoint pubblico (auth via pairingCode, NON via session cookie) usato
 * dalla Chrome extension per pushare chunk di trascrizione live in
 * tempo reale durante una call Meet/Zoom/Teams.
 *
 * Body:
 *   {
 *     pairingCode: string,
 *     chunks: Array<{
 *       ts: string (ISO),
 *       text: string,
 *       speaker?: "me" | "other" | "unknown"
 *     }>
 *   }
 *
 * Sicurezza:
 *   - pairingCode è 8 char alfanumerico, TTL 24h, monouso per InterviewSession.
 *   - Non espone PII del candidato (l'extension ne è già a conoscenza
 *     perché è installata dall'utente stesso).
 *   - Rate-limit lato infra (Vercel) sufficient per MVP; aggiungere
 *     un cap per session se vediamo abuse.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const pairingCode =
    typeof body.pairingCode === "string" ? body.pairingCode.trim() : "";
  if (!pairingCode) {
    return NextResponse.json({ error: "missing_pairing" }, { status: 400 });
  }

  const session = await prisma.interviewSession.findUnique({
    where: { pairingCode },
  });
  if (
    !session ||
    !session.pairingCodeExpiresAt ||
    session.pairingCodeExpiresAt < new Date()
  ) {
    return NextResponse.json(
      { error: "invalid_or_expired_pairing" },
      { status: 401 },
    );
  }

  const chunks = Array.isArray(body.chunks) ? body.chunks : [];
  if (chunks.length === 0) {
    return NextResponse.json({ ok: true, accepted: 0 });
  }

  // Normalizza + append al transcriptJsonl. Mai più di 200KB totali per
  // session per evitare bloat in DB.
  const normalized: string[] = [];
  for (const c of chunks) {
    if (!c || typeof c !== "object") continue;
    const entry = c as Record<string, unknown>;
    const text = typeof entry.text === "string" ? entry.text.trim() : "";
    if (!text) continue;
    normalized.push(
      JSON.stringify({
        ts: typeof entry.ts === "string" ? entry.ts : new Date().toISOString(),
        text: text.slice(0, 800),
        speaker:
          typeof entry.speaker === "string"
            ? entry.speaker
            : "unknown",
        source: "extension",
      }),
    );
  }
  if (normalized.length === 0) {
    return NextResponse.json({ ok: true, accepted: 0 });
  }

  const existing = session.transcriptJsonl ?? "";
  const appended =
    existing + (existing ? "\n" : "") + normalized.join("\n");
  const truncated =
    appended.length > 200_000
      ? appended.slice(appended.length - 200_000)
      : appended;

  await prisma.interviewSession.update({
    where: { id: session.id },
    data: {
      transcriptJsonl: truncated,
      startedAt: session.startedAt ?? new Date(),
    },
  });

  return NextResponse.json({ ok: true, accepted: normalized.length });
}
