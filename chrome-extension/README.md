# LavorAI Interview Copilot — Chrome Extension

Cattura l'audio della tab corrente (Google Meet / Zoom Web / Teams) e
lo trascrive verso il tuo account LavorAI per ricevere suggerimenti
in tempo reale durante un colloquio.

## Stato attuale

**v0.1.0 — scaffold funzionante, trascrizione automatica disabilitata.**

| Pezzo | Stato |
|---|---|
| Manifest V3 | ✅ |
| Popup UI con pairing code | ✅ |
| Cattura audio via `chrome.tabCapture` | ✅ |
| Offscreen document + MediaRecorder | ✅ |
| Endpoint `/api/interview/transcript` (ingestion) | ✅ |
| Endpoint `/api/interview/transcribe` (Whisper) | ⚠️ **placeholder, ritorna 501** |
| Diarization (chi parla?) | ❌ futuro |
| Distribuzione Chrome Web Store | ❌ in attesa di v1 stabile |

In v0.1.0 la cattura audio parte ma niente arriva al server come testo
— l'utente continua a usare il bottone "Detta" o l'incolla manuale
nella pagina `/interview/live` per inserire le domande.

## Come testare la v0.1

1. Apri `chrome://extensions/`
2. Attiva "Modalità sviluppatore" in alto a destra
3. Premi "Carica estensione non pacchettizzata" e seleziona la cartella
   `chrome-extension/` di questo repo
4. Apri https://lavorai.it/interview/live/<applicationId>, copia il
   pairing code (in alto a destra)
5. Apri Google Meet in una nuova tab
6. Apri il popup dell'estensione, incolla il pairing code, premi
   "Inizia ad ascoltare la tab"
7. La pagina LavorAI mostrerà il badge "in ascolto"; quando attiveremo
   Whisper (vedi sotto) i chunk testuali appariranno nella history

## Attivare Whisper (~30 min di lavoro)

Edita `src/app/api/interview/transcribe/route.ts`:

```ts
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// dentro POST handler, dopo l'auth check:
const arrayBuffer = await (audio as Blob).arrayBuffer();
const file = new File([arrayBuffer], "chunk.webm", { type: "audio/webm" });
const result = await openai.audio.transcriptions.create({
  file,
  model: "whisper-1",
  language: "it",
});
return NextResponse.json({ ok: true, text: result.text });
```

Aggiungi `OPENAI_API_KEY` a `.env.local` + Vercel env vars.

Costo Whisper: $0.006/min → €0.30/h di colloquio. Da contabilizzare nel
piano Premium.

## Privacy

- L'audio è catturato SOLO dalla tab attiva dove premi "Inizia"
- L'utente VEDE in popup quando è attivo (dot pulsante)
- Niente keep-alive in background quando non si registra
- I chunk audio NON vengono salvati nel DB; solo il testo trascritto
- Pairing code monouso per sessione, scade dopo 24h

## Pubblicazione su Chrome Web Store (TODO)

- Riempire `icons/` con asset 16/32/48/128 px (ora vuoti — placeholder)
- Aggiungere screenshot della popup + della pagina /interview/live
- Privacy policy URL pointing a /privacy
- Dichiarare permessi `tabCapture` con justification chiara
- Review tempo: 3-7 giorni
