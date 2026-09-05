"use client";

import { useState } from "react";
import useSWR from "swr";

interface PopupRow {
  id: string;
  title: string;
  body: string;
  kind: string;
  audience: string;
  ctaLabel: string | null;
  active: boolean;
  createdAt: string;
  expiresAt: string | null;
  _count: { responses: number };
}

interface ResponseRow {
  id: string;
  rating: number | null;
  text: string | null;
  dismissed: boolean;
  createdAt: string;
  user: { email: string };
}

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const KIND_LABEL: Record<string, string> = {
  rating: "⭐ Valutazione (1-5)",
  feedback: "💬 Feedback libero",
  improvement: "💡 Proposta miglioramento",
  info: "📢 Annuncio (solo OK)",
};
const AUDIENCE_LABEL: Record<string, string> = {
  all: "Tutti",
  free: "Solo Free",
  pro: "Solo Pro",
  pro_plus: "Solo Pro+",
};

/**
 * Pannello admin per creare e gestire i popup mostrati agli utenti
 * (sondaggi, feedback, proposte di miglioramento) + lettura risposte.
 */
export function AdminPopups({ embedded = false }: { embedded?: boolean } = {}) {
  const { data, mutate } = useSWR<{ popups: PopupRow[] }>(
    "/api/admin/popups",
    fetcher,
  );
  const popups = data?.popups ?? [];

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState("feedback");
  const [audience, setAudience] = useState("all");
  const [ctaLabel, setCtaLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openResponses, setOpenResponses] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(!embedded);

  async function create() {
    if (saving) return;
    setError(null);
    if (!title.trim() || !body.trim()) {
      setError("Titolo e messaggio sono obbligatori.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/popups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          bodyText: body,
          kind,
          audience,
          ctaLabel: ctaLabel || undefined,
          expiresAt: expiresAt || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Errore nella creazione.");
        return;
      }
      setTitle("");
      setBody("");
      setCtaLabel("");
      setExpiresAt("");
      mutate();
    } finally {
      setSaving(false);
    }
  }

  async function toggle(id: string, active: boolean) {
    await fetch(`/api/admin/popups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    mutate();
  }

  async function remove(id: string) {
    if (!confirm("Eliminare questo popup e tutte le sue risposte?")) return;
    await fetch(`/api/admin/popups/${id}`, { method: "DELETE" });
    if (openResponses === id) setOpenResponses(null);
    mutate();
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    borderRadius: 10,
    border: "1px solid var(--border-ds)",
    background: "var(--bg)",
    color: "var(--fg)",
    padding: "9px 11px",
    fontSize: 13.5,
    fontFamily: "inherit",
  };

  return (
    <section
      style={embedded ? undefined : { padding: 18, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)", marginBottom: 16 }}
    >
      {!embedded && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 4 }}>📣 Popup &amp; sondaggi utenti</h2>
          <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: "0 0 14px" }}>
            Crea popup mostrati dentro l&apos;app (gradimento, feedback, proposte di miglioramento). Ogni utente lo vede una volta sola.
          </p>
        </>
      )}
      {embedded && (
        <button type="button" className="adm-btn primary" onClick={() => setShowForm((v) => !v)} style={{ padding: "9px 16px", fontSize: 13, marginBottom: 12 }}>
          {showForm ? "✕ Chiudi" : "+ Nuovo popup"}
        </button>
      )}

      {/* FORM CREAZIONE */}
      {showForm && (
      <div
        style={{
          display: "grid",
          gap: 10,
          padding: 14,
          borderRadius: 12,
          background: "var(--bg)",
          border: "1px solid var(--border-ds)",
          marginBottom: 18,
        }}
      >
        <input
          style={inputStyle}
          placeholder="Titolo (es. Ti piace LavorAI?)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
        <textarea
          style={{ ...inputStyle, resize: "vertical" }}
          placeholder="Messaggio per l'utente…"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          <label style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>
            Tipo
            <select
              style={{ ...inputStyle, marginTop: 4 }}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {Object.entries(KIND_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>
            Pubblico
            <select
              style={{ ...inputStyle, marginTop: 4 }}
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            >
              {Object.entries(AUDIENCE_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          <input
            style={inputStyle}
            placeholder="Etichetta bottone (opzionale)"
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
            maxLength={60}
          />
          <label style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>
            Scadenza (opzionale)
            <input
              type="date"
              style={{ ...inputStyle, marginTop: 4 }}
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </label>
        </div>
        {error && (
          <div style={{ fontSize: 12.5, color: "#fca5a5" }}>{error}</div>
        )}
        <button
          type="button"
          onClick={create}
          disabled={saving}
          style={{
            justifySelf: "start",
            padding: "9px 18px",
            borderRadius: 10,
            border: "none",
            background: "hsl(var(--primary))",
            color: "#001a0d",
            fontSize: 13.5,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {saving ? "Creo…" : "Crea popup"}
        </button>
      </div>
      )}

      {/* LISTA POPUP */}
      {popups.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
          Nessun popup creato.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {popups.map((p) => (
            <div
              key={p.id}
              style={{
                padding: 14,
                borderRadius: 12,
                background: "var(--bg)",
                border: "1px solid var(--border-ds)",
                opacity: p.active ? 1 : 0.6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {p.title}
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--fg-muted)",
                      marginTop: 2,
                    }}
                  >
                    {p.body}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--fg-subtle)",
                      marginTop: 6,
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span>{KIND_LABEL[p.kind] ?? p.kind}</span>
                    <span>· {AUDIENCE_LABEL[p.audience] ?? p.audience}</span>
                    <span>· {p._count.responses} risposte</span>
                    {p.expiresAt && (
                      <span>
                        · scade{" "}
                        {new Date(p.expiresAt).toLocaleDateString("it-IT")}
                      </span>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexShrink: 0,
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggle(p.id, !p.active)}
                    style={chipBtn(p.active)}
                  >
                    {p.active ? "Attivo" : "Disattivo"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenResponses(openResponses === p.id ? null : p.id)
                    }
                    style={chipBtn(false)}
                  >
                    {openResponses === p.id ? "Nascondi" : "Risposte"}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    style={{ ...chipBtn(false), color: "#fca5a5" }}
                  >
                    Elimina
                  </button>
                </div>
              </div>

              {openResponses === p.id && <Responses popupId={p.id} />}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function chipBtn(on: boolean): React.CSSProperties {
  return {
    fontSize: 11.5,
    fontWeight: 600,
    padding: "5px 10px",
    borderRadius: 999,
    cursor: "pointer",
    border: "1px solid var(--border-ds)",
    background: on ? "hsl(var(--primary)/0.18)" : "transparent",
    color: on ? "hsl(var(--primary))" : "var(--fg-muted)",
  };
}

function Responses({ popupId }: { popupId: string }) {
  const { data } = useSWR<{
    responses: ResponseRow[];
    stats: {
      total: number;
      answered: number;
      dismissed: number;
      avgRating: number | null;
    };
  }>(`/api/admin/popups/${popupId}/responses`, fetcher);

  if (!data) {
    return (
      <div style={{ fontSize: 12, color: "var(--fg-subtle)", marginTop: 12 }}>
        Carico…
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 12,
        paddingTop: 12,
        borderTop: "1px solid var(--border-ds)",
      }}
    >
      <div
        style={{
          fontSize: 11.5,
          color: "var(--fg-muted)",
          marginBottom: 10,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span>{data.stats.answered} risposte</span>
        <span>· {data.stats.dismissed} ignorate</span>
        {data.stats.avgRating != null && (
          <span>· media ⭐ {data.stats.avgRating.toFixed(1)}/5</span>
        )}
      </div>
      {data.responses.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>
          Ancora nessuna risposta.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8, maxHeight: 300, overflowY: "auto" }}>
          {data.responses
            .filter((r) => !r.dismissed && (r.rating || r.text))
            .map((r) => (
              <div
                key={r.id}
                style={{
                  fontSize: 12.5,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "var(--bg-elev)",
                  border: "1px solid var(--border-ds)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span style={{ color: "var(--fg-muted)" }}>
                    {r.user.email}
                  </span>
                  {r.rating != null && <span>{"⭐".repeat(r.rating)}</span>}
                </div>
                {r.text && (
                  <div style={{ marginTop: 4, color: "var(--fg)" }}>
                    {r.text}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
