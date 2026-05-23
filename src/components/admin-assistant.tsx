"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import { Icon } from "@/components/design/icon";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Quanti utenti reali ho e quanti pagano?",
  "Le candidature arrivano davvero alle aziende?",
  "Perché nessuno converte a pagamento?",
  "Cosa dovrei sistemare per primo?",
];

/**
 * Sidebar assistente AI per la dashboard admin. Chat con Claude che
 * ha accesso allo snapshot live della piattaforma (via /api/admin/
 * assistant). Floating panel a destra, toggle con bottone fisso.
 */
export function AdminAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${data.message ?? data.error ?? "Errore"}` }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      }
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "⚠️ Errore di rete." }]);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  return (
    <>
      {/* Toggle FAB */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="admin-ai-fab"
          aria-label="Apri assistente AI"
        >
          <Icon name="sparkles" size={20} />
        </button>
      )}

      {open && (
        <div className="admin-ai-panel">
          {/* Header */}
          <div className="admin-ai-head">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="sparkles" size={15} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>Admin AI</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  title="Nuova conversazione"
                  className="admin-ai-iconbtn"
                >
                  <Icon name="refresh" size={14} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Chiudi"
                className="admin-ai-iconbtn"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="admin-ai-body">
            {messages.length === 0 ? (
              <div style={{ padding: "8px 2px" }}>
                <div style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.55, marginBottom: 14 }}>
                  Chiedimi qualsiasi cosa sui dati della piattaforma. Ho accesso live a utenti, candidature, consegne, job pool, conversioni.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      className="admin-ai-suggestion"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "92%",
                    padding: "9px 12px",
                    borderRadius: 12,
                    background: m.role === "user" ? "hsl(var(--primary) / 0.18)" : "var(--bg-elev)",
                    border: m.role === "user" ? "1px solid hsl(var(--primary) / 0.3)" : "1px solid var(--border-ds)",
                    fontSize: 13,
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.content}
                </div>
              ))
            )}
            {loading && (
              <div style={{ alignSelf: "flex-start", fontSize: 12.5, color: "var(--fg-subtle)", padding: "9px 12px" }}>
                <Icon name="refresh" size={12} /> sto leggendo i dati...
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={onSubmit} className="admin-ai-input">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Chiedi qualcosa..."
              disabled={loading}
              autoFocus
            />
            <button type="submit" disabled={loading || !input.trim()} aria-label="Invia">
              <Icon name="arrow-up-right" size={15} />
            </button>
          </form>
        </div>
      )}

      <style>{`
        .admin-ai-fab {
          position: fixed; bottom: 24px; right: 24px; z-index: 70;
          width: 52px; height: 52px; border-radius: 999px;
          background: hsl(var(--primary)); color: #001a0d; border: none;
          display: inline-flex; align-items: center; justify-content: center;
          box-shadow: 0 8px 24px hsl(var(--primary)/0.4), 0 18px 50px rgba(0,0,0,0.3);
          cursor: pointer; transition: transform 0.15s;
        }
        .admin-ai-fab:hover { transform: scale(1.06); }
        .admin-ai-panel {
          position: fixed; top: 0; right: 0; bottom: 0; z-index: 71;
          width: 400px; max-width: 92vw;
          background: var(--bg); border-left: 1px solid var(--border-ds);
          box-shadow: -20px 0 50px rgba(0,0,0,0.4);
          display: flex; flex-direction: column;
          animation: admin-ai-slide 0.22s cubic-bezier(0.2,0.8,0.3,1);
        }
        @keyframes admin-ai-slide { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .admin-ai-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 16px; border-bottom: 1px solid var(--border-ds); flex-shrink: 0;
        }
        .admin-ai-iconbtn {
          width: 28px; height: 28px; border-radius: 7px; border: 1px solid var(--border-ds);
          background: var(--bg-elev); color: var(--fg-muted); cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .admin-ai-body {
          flex: 1; overflow-y: auto; padding: 14px 16px;
          display: flex; flex-direction: column; gap: 10px;
        }
        .admin-ai-suggestion {
          text-align: left; padding: 9px 12px; border-radius: 10px;
          background: var(--bg-elev); border: 1px solid var(--border-ds);
          color: var(--fg); font-size: 12.5px; cursor: pointer; line-height: 1.4;
        }
        .admin-ai-suggestion:hover { background: var(--bg-sunken); }
        .admin-ai-input {
          display: flex; gap: 8px; padding: 12px 14px;
          border-top: 1px solid var(--border-ds); flex-shrink: 0;
        }
        .admin-ai-input input {
          flex: 1; padding: 10px 12px; border-radius: 9px;
          background: var(--bg-elev); border: 1px solid var(--border-ds);
          color: var(--fg); font-size: 13px; outline: none;
        }
        .admin-ai-input input:focus { border-color: hsl(var(--primary)); }
        .admin-ai-input button {
          width: 40px; border-radius: 9px; border: none;
          background: hsl(var(--primary)); color: #001a0d; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .admin-ai-input button:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>
    </>
  );
}
