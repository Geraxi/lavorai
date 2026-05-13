/* LavorAI Interview Copilot — background service worker.
 *
 * Architettura:
 *   - popup.js manda START_CAPTURE { pairingCode } al background
 *   - background apre l'offscreen document (audio-processor.html) che è
 *     l'unico contesto in MV3 dove puoi processare uno stream audio.
 *   - background usa chrome.tabCapture.getMediaStreamId() per ottenere
 *     uno stream ID della tab attiva, lo passa all'offscreen document.
 *   - offscreen document attiva Web Speech API in modo continuo sullo
 *     stream → emette transcript chunks → li manda al background.
 *   - background POSTa i chunk a https://lavorai.it/api/interview/transcript
 *     col pairingCode dell'utente.
 *
 * NB: la trascrizione del browser-side Web Speech non funziona su uno
 * stream arbitrario direttamente. La strategia reale è:
 *   1. Cattura lo stream con chrome.tabCapture
 *   2. Crea un <audio> element nell'offscreen che riproduce lo stream
 *      (muted alla tab originale per non sentire doppio)
 *   3. Run Web Speech API ascoltando il MICROFONO virtuale OR
 *   4. Fallback: stream l'audio chunked al nostro backend Whisper
 *
 * Per il MVP qui sotto, implementiamo lo SCAFFOLD del flusso. La
 * trascrizione reale (Whisper o Web Speech routing) è documentata
 * inline come TODO — richiede o un endpoint Whisper sul backend o
 * un trick per il routing del Web Speech che è browser-dipendente.
 */

const API_BASE = "https://lavorai.it";
const OFFSCREEN_URL = "audio-processor.html";

let currentPairingCode = null;
let capturing = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "START_CAPTURE") {
    startCapture(message.pairingCode)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // keep channel open for async response
  }
  if (message.type === "STOP_CAPTURE") {
    stopCapture()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (message.type === "TRANSCRIPT_CHUNK") {
    // From offscreen document → forward to backend
    forwardChunk(message.chunk).then(() => sendResponse({ ok: true }));
    return true;
  }
});

async function startCapture(pairingCode) {
  if (capturing) return { ok: false, error: "Cattura già in corso" };
  currentPairingCode = pairingCode;

  // 1. Trova la tab attiva (Meet/Zoom/Teams)
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { ok: false, error: "Nessuna tab attiva trovata" };

  // 2. Crea l'offscreen document se non esiste
  const existing = await chrome.offscreen.hasDocument?.();
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ["USER_MEDIA"],
      justification:
        "Necessario per processare lo stream audio della tab di Google Meet/Zoom/Teams e trascriverlo localmente prima di inviarlo a LavorAI.",
    });
  }

  // 3. Ottieni lo streamId della tab corrente
  const streamId = await new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId(
      { targetTabId: tab.id },
      (id) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(id);
        }
      },
    );
  });

  // 4. Manda lo streamId all'offscreen document
  chrome.runtime.sendMessage({
    type: "OFFSCREEN_START",
    streamId,
    pairingCode,
  });

  capturing = true;
  return { ok: true };
}

async function stopCapture() {
  capturing = false;
  currentPairingCode = null;
  chrome.runtime.sendMessage({ type: "OFFSCREEN_STOP" });
  // Lascia l'offscreen aperto: closing+reopening è costoso, tanto è idle.
}

async function forwardChunk(chunk) {
  if (!currentPairingCode) return;
  try {
    await fetch(`${API_BASE}/api/interview/transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pairingCode: currentPairingCode,
        chunks: [chunk],
      }),
    });
  } catch (err) {
    console.warn("[lavorai] transcript POST failed", err);
  }
}
