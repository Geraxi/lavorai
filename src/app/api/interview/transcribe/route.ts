import { NextResponse, type NextRequest } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/interview/transcribe
 *
 * Riceve chunk audio multipart/form-data dall'extension Chrome
 * (FormData con `audio`, `pairingCode`, `seq`, `ts`), trascrive con
 * OpenAI Whisper, e appende il testo alla InterviewSession.transcriptJsonl.
 *
 * Auth via pairingCode (no session cookie — l'extension non ha il cookie).
 *
 * Cost: ~$0.006/min audio → ~€0.30/ora colloquio. Limite per sicurezza
 * a 50 chunk/session (~5 min audio per session) finché non aggiungiamo
 * billing per-call.
 */

let cached: OpenAI | null = null;
function getClient(): OpenAI {
  if (cached) return cached;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  cached = new OpenAI({ apiKey });
  return cached;
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "missing_form" }, { status: 400 });
  }
  const pairingCode = String(form.get("pairingCode") ?? "");
  const audio = form.get("audio");
  const seq = String(form.get("seq") ?? "0");
  const ts = String(form.get("ts") ?? new Date().toISOString());

  if (!pairingCode || !(audio instanceof Blob)) {
    return NextResponse.json(
      { error: "missing_audio_or_code" },
      { status: 400 },
    );
  }

  // Auth via pairing code
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

  if (audio.size < 1000) {
    // Chunk troppo piccolo per essere significativo. Skip silenzioso.
    return NextResponse.json({ ok: true, text: "", skipped: "too_small" });
  }
  if (audio.size > 25 * 1024 * 1024) {
    // Whisper API limit 25MB. Nostri chunk da 6s sono ~50-100KB,
    // ma defensive check.
    return NextResponse.json(
      { error: "audio_too_large" },
      { status: 413 },
    );
  }

  let text = "";
  try {
    const client = getClient();
    const buffer = Buffer.from(await audio.arrayBuffer());
    // OpenAI SDK accetta un File-like object via toFile() helper
    const file = await OpenAI.toFile(buffer, `chunk-${seq}.webm`, {
      type: "audio/webm",
    });
    const result = await client.audio.transcriptions.create({
      file,
      model: "whisper-1",
      // Bilingual: lascia auto-detect così funziona sia colloqui IT che EN
      // language non specificato = auto
      response_format: "json",
      // Temperature bassa = trascrizione più conservativa, meno hallucinations
      temperature: 0.0,
    });
    text = (result.text ?? "").trim();
  } catch (err) {
    console.error("[transcribe] Whisper failed", err);
    return NextResponse.json(
      {
        error: "whisper_error",
        message: err instanceof Error ? err.message : "Whisper API failure",
      },
      { status: 502 },
    );
  }

  if (!text) {
    // Audio silenzioso o non parlato (musica, rumore di fondo). Skip.
    return NextResponse.json({ ok: true, text: "", skipped: "no_speech" });
  }

  // Append al transcriptJsonl. Cap a 200KB.
  const entry = JSON.stringify({
    ts,
    text: text.slice(0, 800),
    speaker: "unknown",
    source: "whisper",
    seq: Number(seq) || 0,
  });
  const existing = session.transcriptJsonl ?? "";
  const appended = existing + (existing ? "\n" : "") + entry;
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

  return NextResponse.json({ ok: true, text });
}
