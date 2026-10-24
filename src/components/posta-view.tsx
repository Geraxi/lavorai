"use client";

import { useMemo, useState } from "react";
import type { MailboxThread } from "@/lib/application-mailbox-store";

function formatWhen(iso: string, locale: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(+d)) return iso;
  return d.toLocaleString(locale === "en" ? "en-GB" : "it-IT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function PostaView({ locale, threads }: { locale: string; threads: MailboxThread[] }) {
  const en = locale === "en";
  const [selectedId, setSelectedId] = useState(threads[0]?.applicationId ?? null);
  const selected = useMemo(() => threads.find((t) => t.applicationId === selectedId) ?? threads[0] ?? null, [threads, selectedId]);
  return (
    <div className="posta-page">
      <section className="posta-intro">
        <h1>{en ? "Application mailbox" : "Posta candidature"}</h1>
        <p>
          {en
            ? "Inbound mail to your LavorAI application address, grouped by job. We never reply to the employer for you."
            : "Email arrivate all’indirizzo LavorAI della candidatura, raggruppate per annuncio. Non rispondiamo noi al recruiter."}
        </p>
      </section>
      {threads.length === 0 ? (
        <div className="posta-empty">{en ? "No application mail yet." : "Nessun messaggio di candidatura per ora."}</div>
      ) : (
        <div className="posta-split">
          <ol className="posta-list">
            {threads.map((thread) => (
              <li key={thread.applicationId}>
                <button
                  type="button"
                  className={thread.applicationId === selected?.applicationId ? "is-active" : ""}
                  onClick={() => setSelectedId(thread.applicationId)}
                >
                  <strong>{thread.jobTitle}</strong>
                  <small>{thread.company ?? "—"} · {thread.messages.length}</small>
                  {thread.confirmedAt && (
                    <span className="posta-receipt">{en ? "Receipt confirmed" : "Ricevuta confermata"}</span>
                  )}
                </button>
              </li>
            ))}
          </ol>
          {selected && (
            <article className="posta-thread">
              <header>
                <h2>{selected.jobTitle}</h2>
                <p>{selected.company ?? "—"}</p>
                {selected.confirmedAt && (
                  <p className="posta-receipt-detail">
                    {en ? "Receipt confirmed" : "Ricevuta confermata"}
                    {" · "}
                    {formatWhen(selected.confirmedAt, locale)}
                    {selected.confirmedFrom ? ` · ${selected.confirmedFrom}` : ""}
                  </p>
                )}
              </header>
              <ul>
                {selected.messages.map((message) => (
                  <li key={message.id} className="posta-msg">
                    <div className="posta-msg-meta">
                      <span className="ds-chip">{message.label}</span>
                      <span>{formatWhen(message.receivedAt, locale)}</span>
                    </div>
                    <strong>{message.fromAddress}</strong>
                    {message.subject && <p className="posta-subject">{message.subject}</p>}
                    <p className="posta-body">{message.bodyText || (en ? "(no text)" : "(nessun testo)")}</p>
                  </li>
                ))}
              </ul>
            </article>
          )}
        </div>
      )}
    </div>
  );
}
