"use client";

import { useState } from "react";
import useSWR from "swr";

interface Candidate {
  email: string;
  name: string | null;
  step: string;
  createdAt: string;
}

interface RunResult {
  sent: number;
  skipped: number;
  candidates: number;
  details: Array<{ email: string; step: string; status: string }>;
}

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const STEP_LABEL: Record<string, string> = {
  verify: "Email da verificare",
  cv: "CV mancante",
  preferences: "Preferenze mancanti",
  first_application: "1ª candidatura",
};

interface DirectoryUser {
  email: string;
  name: string | null;
  tier: string;
}

/**
 * Pannello admin: nudge di onboarding agli utenti bloccati.
 * Mostra l'anteprima dei destinatari (per step) e permette di inviare.
 */
export function AdminNudges() {
  const { data, mutate, isLoading } = useSWR<{
    count: number;
    candidates: Candidate[];
  }>("/api/admin/nudges", fetcher);

  const { data: directory } = useSWR<{ users: DirectoryUser[] }>(
    "/api/admin/users-list",
    fetcher,
  );

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [onlyEmail, setOnlyEmail] = useState("");
  const [ignoreCooldown, setIgnoreCooldown] = useState(false);

  async function run(dryRun: boolean) {
    if (sending) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/nudges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dryRun,
          onlyEmail: onlyEmail.trim() || undefined,
          ignoreCooldown,
        }),
      });
      const j = (await res.json()) as RunResult;
      setResult(j);
      if (!dryRun) mutate();
    } finally {
      setSending(false);
    }
  }

  const candidates = data?.candidates ?? [];

  return (
    <section
      style={{
        padding: 18,
        borderRadius: 14,
        background: "var(--bg-elev)",
        border: "1px solid var(--border-ds)",
        marginBottom: 16,
      }}
    >
      <h2
        style={{
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          marginBottom: 4,
        }}
      >
        Nudge onboarding
      </h2>
      <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: "0 0 14px" }}>
        Email che ricordano agli utenti bloccati di completare lo step mancante
        (verifica → CV → preferenze → 1ª candidatura). Esclude test/interni, max
        1 ogni 5 giorni per utente, rispetta la quota email.
      </p>

      <div style={{ marginBottom: 14 }}>
        <label
          style={{
            display: "block",
            fontSize: 11,
            color: "var(--fg-subtle)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 600,
            marginBottom: 6,
          }}
        >
          Destinatario
        </label>
        <div style={{ position: "relative" }}>
          <select
            value={onlyEmail}
            onChange={(e) => setOnlyEmail(e.target.value)}
            style={{
              width: "100%",
              borderRadius: 10,
              border: "1px solid var(--border-ds)",
              background: "var(--bg)",
              color: "var(--fg)",
              padding: "10px 36px 10px 12px",
              fontSize: 13,
              appearance: "none",
              WebkitAppearance: "none",
              MozAppearance: "none",
              cursor: "pointer",
            }}
          >
            <option value="">
              Tutti gli utenti candidati al nudge ({data?.count ?? 0})
            </option>
            {(directory?.users ?? []).length === 0 ? (
              <option disabled>caricamento utenti…</option>
            ) : (
              <>
                <option disabled>──── utenti reali ({directory?.users.length ?? 0}) ────</option>
                {(directory?.users ?? []).map((u) => (
                  <option key={u.email} value={u.email}>
                    {u.email}
                    {u.name ? ` · ${u.name}` : ""}
                    {u.tier !== "free" ? ` · ${u.tier}` : ""}
                  </option>
                ))}
              </>
            )}
          </select>
          <span
            aria-hidden
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              color: "var(--fg-subtle)",
              fontSize: 11,
            }}
          >
            ▼
          </span>
        </div>
        {onlyEmail && (
          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 6 }}>
            Selezionato: <strong style={{ color: "var(--fg)" }}>{onlyEmail}</strong>
          </div>
        )}
        <label
          style={{
            fontSize: 12,
            color: "var(--fg-muted)",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            marginTop: 10,
          }}
        >
          <input
            type="checkbox"
            checked={ignoreCooldown}
            onChange={(e) => setIgnoreCooldown(e.target.checked)}
          />
          ignora cooldown (consenti invio anche se già nudgato di recente)
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => run(true)}
          disabled={sending}
          style={btn(false)}
        >
          {sending ? "…" : "Anteprima (dry-run)"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (
              confirm(
                "Inviare i nudge email REALI agli utenti elencati? Verranno mandate email vere.",
              )
            )
              run(false);
          }}
          disabled={sending}
          style={btn(true)}
        >
          {sending ? "Invio…" : "Invia nudge reali"}
        </button>
      </div>

      {/* Anteprima destinatari attuali */}
      <div
        style={{
          fontSize: 12.5,
          color: "var(--fg-muted)",
          marginBottom: result ? 14 : 0,
        }}
      >
        {isLoading
          ? "Calcolo destinatari…"
          : `${data?.count ?? 0} utenti riceverebbero un nudge ora.`}
      </div>

      {!isLoading && candidates.length > 0 && !result && (
        <div style={{ display: "grid", gap: 6, maxHeight: 260, overflowY: "auto" }}>
          {candidates.map((c) => (
            <div
              key={c.email}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                fontSize: 12.5,
                padding: "7px 10px",
                borderRadius: 8,
                background: "var(--bg)",
                border: "1px solid var(--border-ds)",
              }}
            >
              <span style={{ color: "var(--fg)" }}>
                {c.email}
                {c.name ? (
                  <span style={{ color: "var(--fg-subtle)" }}> · {c.name}</span>
                ) : null}
              </span>
              <span style={{ color: "var(--fg-muted)", whiteSpace: "nowrap" }}>
                {STEP_LABEL[c.step] ?? c.step}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Risultato run */}
      {result && (
        <div
          style={{
            marginTop: 4,
            padding: 12,
            borderRadius: 10,
            background: "var(--bg)",
            border: "1px solid var(--border-ds)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            {result.details.some((d) => d.status === "dry_run")
              ? `Dry-run: ${result.candidates} destinatari`
              : `Inviati ${result.sent} · saltati ${result.skipped} · totale candidati ${result.candidates}`}
          </div>
          <div style={{ display: "grid", gap: 5, maxHeight: 260, overflowY: "auto" }}>
            {result.details.map((d) => (
              <div
                key={d.email}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  fontSize: 12,
                }}
              >
                <span style={{ color: "var(--fg-muted)" }}>{d.email}</span>
                <span
                  style={{
                    color:
                      d.status === "sent"
                        ? "hsl(var(--primary))"
                        : d.status.startsWith("error")
                          ? "#fca5a5"
                          : "var(--fg-subtle)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {STEP_LABEL[d.step] ?? d.step} · {d.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function btn(primary: boolean): React.CSSProperties {
  return {
    padding: "9px 16px",
    borderRadius: 10,
    border: primary ? "none" : "1px solid var(--border-ds)",
    background: primary ? "hsl(var(--primary))" : "transparent",
    color: primary ? "#001a0d" : "var(--fg-muted)",
    fontSize: 13.5,
    fontWeight: 700,
    cursor: "pointer",
  };
}
