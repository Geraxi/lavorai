"use client";

import { useState } from "react";
import useSWR from "swr";

interface Preview {
  count: number;
  limitHitCount: number;
  genericCount: number;
  candidates: Array<{
    email: string;
    name: string | null;
    applications: number;
    daysSinceSignup: number;
    reason: "limit_hit" | "generic";
  }>;
}

interface RunResult {
  sent: number;
  skipped: number;
  candidates: number;
  details: Array<{ email: string; applications: number; status: string }>;
  error?: string;
}

const fetcher = (u: string) => fetch(u).then((r) => r.json());

/**
 * Bottone admin per triggerare gli upgrade_nudge (email a Free users
 * per convertirli a Pro). Mostra l'anteprima dei candidati con
 * segmentazione limit-hit vs generic prima dell'invio reale.
 */
export function AdminUpgradeNudgesButton() {
  const { data: preview, mutate } = useSWR<Preview>(
    "/api/admin/upgrade-nudges",
    fetcher,
  );
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  async function run(dryRun: boolean) {
    if (running) return;
    if (
      !dryRun &&
      !confirm(
        `Inviare l'email upgrade_nudge a ${preview?.count ?? 0} utenti Free? (${preview?.limitHitCount ?? 0} limit-hit + ${preview?.genericCount ?? 0} generic)`,
      )
    )
      return;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/upgrade-nudges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      setResult((await res.json()) as RunResult);
      if (!dryRun) mutate();
    } catch (err) {
      setResult({
        sent: 0,
        skipped: 0,
        candidates: 0,
        details: [],
        error: err instanceof Error ? err.message : "errore",
      });
    } finally {
      setRunning(false);
    }
  }

  const limitHit = preview?.candidates.filter((c) => c.reason === "limit_hit") ?? [];
  const generic = preview?.candidates.filter((c) => c.reason === "generic") ?? [];

  return (
    <div style={{ marginTop: 4 }}>
      {/* Anteprima segmenti */}
      <div
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          background: "var(--bg)",
          border: "1px solid var(--border-ds)",
          fontSize: 12.5,
          color: "var(--fg-muted)",
          lineHeight: 1.7,
          marginBottom: 10,
        }}
      >
        {!preview ? (
          "Calcolo destinatari…"
        ) : preview.count === 0 ? (
          "Nessun utente Free eleggibile ora (tutti nel cooldown o fuori dai criteri)."
        ) : (
          <>
            <strong style={{ color: "var(--fg)" }}>{preview.count} utenti eleggibili</strong>:{" "}
            <span style={{ color: "#fca5a5" }}>{preview.limitHitCount} limit-hit</span>{" "}
            · <span>{preview.genericCount} generic</span>
          </>
        )}
      </div>

      {/* Lista limit-hit (i più preziosi) */}
      {limitHit.length > 0 && (
        <details
          style={{
            marginBottom: 10,
            fontSize: 12,
            color: "var(--fg-muted)",
          }}
        >
          <summary style={{ cursor: "pointer", color: "#fca5a5", fontWeight: 600 }}>
            {limitHit.length} limit-hit (max conversione)
          </summary>
          <div style={{ marginTop: 6, display: "grid", gap: 3 }}>
            {limitHit.slice(0, 20).map((c) => (
              <div key={c.email}>
                {c.email}
                {c.name ? ` · ${c.name}` : ""} · {c.applications} app tot · {c.daysSinceSignup}gg
              </div>
            ))}
          </div>
        </details>
      )}
      {generic.length > 0 && (
        <details style={{ marginBottom: 10, fontSize: 12, color: "var(--fg-muted)" }}>
          <summary style={{ cursor: "pointer" }}>{generic.length} generic</summary>
          <div style={{ marginTop: 6, display: "grid", gap: 3 }}>
            {generic.slice(0, 20).map((c) => (
              <div key={c.email}>
                {c.email}
                {c.name ? ` · ${c.name}` : ""} · {c.applications} app · {c.daysSinceSignup}gg
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Bottoni */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => run(true)}
          disabled={running || !preview || preview.count === 0}
          style={{
            padding: "9px 16px",
            borderRadius: 10,
            border: "1px solid var(--border-ds)",
            background: "transparent",
            color: "var(--fg)",
            fontSize: 13.5,
            fontWeight: 700,
            cursor: running ? "wait" : "pointer",
            opacity: running || !preview || preview.count === 0 ? 0.5 : 1,
          }}
        >
          {running ? "…" : "Anteprima (dry-run)"}
        </button>
        <button
          type="button"
          onClick={() => run(false)}
          disabled={running || !preview || preview.count === 0}
          style={{
            padding: "9px 16px",
            borderRadius: 10,
            border: "none",
            background: "hsl(var(--primary))",
            color: "#001a0d",
            fontSize: 13.5,
            fontWeight: 700,
            cursor: running ? "wait" : "pointer",
            opacity: running || !preview || preview.count === 0 ? 0.5 : 1,
          }}
        >
          {running ? "Invio…" : "Invia upgrade_nudge reali"}
        </button>
      </div>

      {/* Risultato */}
      {result && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: 8,
            background: "var(--bg)",
            border: "1px solid var(--border-ds)",
            fontSize: 12.5,
            color: "var(--fg-muted)",
            lineHeight: 1.7,
          }}
        >
          {result.error ? (
            <span style={{ color: "#fca5a5" }}>Errore: {result.error}</span>
          ) : (
            <>
              <strong style={{ color: "var(--fg)" }}>
                {result.details[0]?.status === "dry_run"
                  ? `Dry-run: ${result.candidates} destinatari`
                  : `Inviate ${result.sent} · saltate ${result.skipped} · totale ${result.candidates}`}
              </strong>
              {result.details.length > 0 && (
                <div style={{ marginTop: 6, display: "grid", gap: 3 }}>
                  {result.details.slice(0, 20).map((d, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <span>{d.email}</span>
                      <span
                        style={{
                          color:
                            d.status === "sent"
                              ? "hsl(var(--primary))"
                              : d.status.startsWith("error") || d.status === "no_resend_key"
                                ? "#fca5a5"
                                : "var(--fg-subtle)",
                        }}
                      >
                        {d.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
