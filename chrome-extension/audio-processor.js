/* LavorAI Interview Copilot — offscreen document audio processor.
 *
 * In Manifest V3, l'unico contesto dove puoi usare l'audio dell'utente
 * + APIs come MediaRecorder è l'offscreen document. Il service worker
 * non ha accesso al DOM né a MediaRecorder.
 *
 * Strategia di trascrizione:
 *
 *   APPROCCIO A — Web Speech API (gratis, no backend Whisper)
 *     Problema: Web Speech ascolta il MICROFONO di sistema, non un
 *     MediaStream arbitrario. Workaround:
 *       1. Crea AudioContext
 *       2. Pipe lo stream della tab in un MediaStreamAudioDestinationNode
 *       3. NON funziona — Web Speech non accetta stream custom.
 *     Quindi questo approccio è VIABLE solo se ascoltiamo il microfono
 *     dell'utente (cioè quello che lui dice, NON l'intervistatore).
 *     Per l'intervistatore servono altri approcci.
 *
 *   APPROCCIO B — MediaRecorder + Whisper backend (consigliato)
 *     1. MediaRecorder registra chunk audio webm/opus ogni 5-8 secondi
 *     2. Manda i chunk a POST /api/interview/transcribe (Whisper)
 *     3. Backend ritorna il testo, l'extension lo forward a /transcript
 *     Costo: ~$0.006/min Whisper API → ~$0.36/ora di colloquio. Fattibile.
 *
 *   APPROCCIO C — Browser-native Speech-to-Text di terze parti
 *     Es. AssemblyAI Real-time, Deepgram. WebSocket-based, latenza
 *     ~300ms. Più caro (~$0.40/ora) ma latenza migliore.
 *
 * V1 SCAFFOLD (questo file): implementa l'approccio B con un endpoint
 * Whisper PLACEHOLDER (/api/interview/transcribe) che è da costruire
 * lato backend. Per ora il file emette eventi di "audio captured" ma
 * non trascrive davvero — l'utente vede la cattura in corso e può
 * incollare manualmente la domanda nel Copilot.
 */

let mediaStream = null;
let mediaRecorder = null;
let pairingCode = null;
let chunkSeq = 0;

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "OFFSCREEN_START") {
    void start(message.streamId, message.pairingCode);
  } else if (message.type === "OFFSCREEN_STOP") {
    stop();
  }
});

async function start(streamId, code) {
  pairingCode = code;
  try {
    // Workaround MV3 + tabCapture: bisogna usare navigator.mediaDevices.getUserMedia
    // col constraint speciale che referenzia lo streamId.
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });

    // CRITICAL: ricollegare l'audio output o l'utente non sentirà più
    // l'intervistatore. Crea un AudioContext che fa passthrough.
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(mediaStream);
    src.connect(ctx.destination);

    // Setup MediaRecorder per chunk audio
    mediaRecorder = new MediaRecorder(mediaStream, {
      mimeType: "audio/webm;codecs=opus",
      audioBitsPerSecond: 24_000,
    });

    mediaRecorder.ondataavailable = async (event) => {
      if (event.data && event.data.size > 0) {
        await sendAudioChunk(event.data);
      }
    };

    // Chunk ogni 6 secondi — bilanciamento latenza/cost Whisper
    mediaRecorder.start(6_000);

    console.log("[lavorai-offscreen] capture started");
  } catch (err) {
    console.error("[lavorai-offscreen] start failed", err);
  }
}

function stop() {
  try {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
  } catch {
    /* noop */
  }
  if (mediaStream) {
    for (const track of mediaStream.getTracks()) track.stop();
  }
  mediaRecorder = null;
  mediaStream = null;
  pairingCode = null;
  console.log("[lavorai-offscreen] capture stopped");
}

async function sendAudioChunk(blob) {
  if (!pairingCode) return;
  const seq = chunkSeq++;
  const formData = new FormData();
  formData.append("audio", blob, `chunk-${seq}.webm`);
  formData.append("pairingCode", pairingCode);
  formData.append("seq", String(seq));
  formData.append("ts", new Date().toISOString());

  // POST al backend Whisper. Endpoint da costruire (vedi
  // src/app/api/interview/transcribe/route.ts — placeholder).
  // In MVP, può fallire silenziosamente: l'utente può comunque
  // incollare/dettare la domanda manualmente nel Copilot.
  try {
    const res = await fetch("https://lavorai.it/api/interview/transcribe", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      console.warn("[lavorai-offscreen] transcribe failed", res.status);
      return;
    }
    const data = await res.json();
    if (data?.text) {
      // Forward al backend transcript endpoint
      chrome.runtime.sendMessage({
        type: "TRANSCRIPT_CHUNK",
        chunk: {
          ts: new Date().toISOString(),
          text: data.text,
          speaker: "unknown",
        },
      });
    }
  } catch (err) {
    console.warn("[lavorai-offscreen] transcribe error", err);
  }
}
