import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/interview/transcribe
 *
 * Endpoint Whisper PLACEHOLDER: riceve chunk audio multipart/form-data
 * dalla Chrome extension (FormData con `audio`, `pairingCode`, `seq`, `ts`)
 * e ritorna la trascrizione testuale.
 *
 * V1 attuale: ritorna 501 Not Implemented finché non integriamo
 * OpenAI Whisper (o Deepgram, AssemblyAI). Quando l'utente preme
 * "Inizia ad ascoltare" nella Chrome extension, il flusso parte ma
 * la trascrizione automatica non avviene — l'utente continua a
 * usare l'input manuale/dettatura nella pagina /interview/live.
 *
 * Integrazione futura (~30 min):
 *   1. npm install openai
 *   2. const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
 *   3. const transcription = await openai.audio.transcriptions.create({
 *        file: audioBlob,
 *        model: "whisper-1",
 *        language: "it"
 *      })
 *   4. return text + speaker labels (Whisper non lo fa nativo, serve
 *      diarization — Deepgram lo offre out-of-the-box).
 *
 * Costo stimato: Whisper ~$0.006/min → €0.30/ora di colloquio.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "missing_form" }, { status: 400 });
  }
  const pairingCode = String(form.get("pairingCode") ?? "");
  const audio = form.get("audio");

  if (!pairingCode || !(audio instanceof Blob)) {
    return NextResponse.json({ error: "missing_audio_or_code" }, { status: 400 });
  }

  // Auth check via pairing code (stesso pattern di /transcript)
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

  // PLACEHOLDER: la vera transcription Whisper va qui.
  // Per ora rispondiamo 501 così l'extension log'a una warning e va
  // avanti — l'utente continua a usare manualmente l'input nel Copilot.
  return NextResponse.json(
    {
      ok: false,
      message:
        "Trascrizione automatica non ancora attiva. Usa il pulsante 'Detta' o incolla manualmente la domanda nella pagina /interview/live.",
      sessionId: session.id,
      audioBytes: audio.size,
    },
    { status: 501 },
  );
}
