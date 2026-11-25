"use client";

import { useEffect, useRef, useState } from "react";
import { Languages } from "lucide-react";

type BrowserTranslator = {
  translate(text: string, options: { signal: AbortSignal }): Promise<string>;
  destroy(): void;
};
type BrowserTranslatorApi = {
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
    signal: AbortSignal;
  }): Promise<BrowserTranslator>;
};
type Translation = {
  subject: string;
  body: string;
  original: { subject: string | null; body: string; en: boolean };
};

export function InboxMessageTranslation({ body, subject, en }: {
  body: string;
  subject: string | null;
  en: boolean;
}) {
  const tr = (english: string, italian: string) => en ? english : italian;
  const [result, setTranslation] = useState<Translation | null>(null);
  const translation = result?.original.body === body && result.original.subject === subject && result.original.en === en
    ? result : null;
  const [showTranslation, setShowTranslation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<"unsupported" | "failed" | "copied" | "copy-failed" | null>(null);
  const inflight = useRef<AbortController | null>(null);
  useEffect(() => () => inflight.current?.abort(), [body, subject, en]);

  const translate = async () => {
    if (inflight.current) return;
    if (translation) {
      setNotice(null);
      setShowTranslation(!showTranslation);
      return;
    }
    const api = (globalThis as { Translator?: BrowserTranslatorApi }).Translator;
    if (!api?.create) {
      setNotice("unsupported");
      return;
    }
    const request = new AbortController();
    inflight.current = request;
    setNotice(null);
    setBusy(true);
    const timer = setTimeout(() => request.abort(), 90_000);
    let translator: BrowserTranslator | undefined;
    try {
      // Called directly from the click: first-use language downloads need user activation.
      translator = await api.create({
        sourceLanguage: "de", targetLanguage: en ? "en" : "it", signal: request.signal,
      });
      const translatedBody = await translator.translate(body, { signal: request.signal });
      const translatedSubject = subject?.trim()
        ? await translator.translate(subject, { signal: request.signal }) : "";
      if (request.signal.aborted || !translatedBody.trim()) throw new Error("Empty translation");
      setTranslation({ body: translatedBody, subject: translatedSubject, original: { body, subject, en } });
      setShowTranslation(true);
    } catch {
      setNotice("failed");
    } finally {
      clearTimeout(timer);
      translator?.destroy();
      if (inflight.current === request) {
        inflight.current = null;
        setBusy(false);
      }
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(subject?.trim() ? `${subject}\n\n${body}` : body);
      setNotice("copied");
    } catch {
      setShowTranslation(false);
      setNotice("copy-failed");
    }
  };

  const status = busy ? tr(
    "Translating on your device. First use may download a language pack.",
    "Traduzione sul dispositivo. Al primo utilizzo potrebbe essere scaricato un pacchetto lingua.",
  ) : notice === "unsupported" ? tr(
    "This browser cannot translate on your device. Copy the original or try Chrome on desktop.",
    "Questo browser non può tradurre sul dispositivo. Copia l’originale o prova Chrome su computer.",
  ) : notice === "failed" ? tr(
    "On-device translation didn’t finish. Try again or copy the original.",
    "Traduzione sul dispositivo non riuscita. Riprova o copia l’originale.",
  ) : notice === "copied" ? tr("Original copied.", "Originale copiato.")
    : notice === "copy-failed" ? tr(
      "Couldn’t copy. You can select and copy the original text.",
      "Copia non riuscita. Puoi selezionare e copiare il testo originale.",
    ) : null;

  return <>
    <div className="mail-translation-actions">
      <button type="button" className="mail-text-button" disabled={busy} onClick={translate}>
        <Languages size={14} aria-hidden="true" />
        {showTranslation && translation ? tr("Show original", "Mostra originale") : tr("Translate from German", "Traduci dal tedesco")}
      </button>
      <button type="button" className="mail-text-button" disabled={busy} onClick={copy}>
        {tr("Copy original", "Copia originale")}
      </button>
    </div>
    {status && <p className="mail-notice" role="status">{status}</p>}
    {showTranslation && translation ? <div className="mail-translation">
      <p className="mail-delivery" role="status">{tr("Automatic translation", "Traduzione automatica")}</p>
      {translation.subject && <strong className="mail-translation-subject">{translation.subject}</strong>}
      <div className="mail-body" data-testid="message-body">{translation.body}</div>
    </div> : <div className="mail-body" data-testid="message-body">{body}</div>}
  </>;
}
