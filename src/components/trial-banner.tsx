import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { trialState } from "@/lib/billing";
import { Icon } from "@/components/design/icon";

/**
 * Striscia discreta sotto la topbar durante la prova Pro senza carta.
 * Tono premium, niente allarme: "Pro attivo · 5 giorni" + progress bar +
 * link a Impostazioni. Sparisce quando l'utente paga o la prova finisce
 * (in quel caso parla UpgradePrompt).
 */
export async function TrialBanner() {
  const user = await getCurrentUser();
  if (!user) return null;
  const t = trialState(user);
  if (t.status !== "active" || !t.endsAt) return null;
  const total = 7;
  const pct = Math.max(6, Math.min(100, Math.round(((total - t.daysLeft) / total) * 100)));
  const ends = t.endsAt.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
  const last = t.daysLeft <= 2;

  return (
    <div
      role="status"
      aria-label="Prova Pro attiva"
      style={{
        margin: "12px 24px 0",
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 14px",
        borderRadius: 12,
        border: "1px solid var(--border-ds)",
        background: "var(--bg-surface)",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 9px",
          borderRadius: 999,
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          background: "hsl(var(--primary) / 0.16)",
          color: "hsl(var(--primary))",
        }}
      >
        <Icon name="sparkles" size={11} /> Pro
      </span>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ fontSize: 13, color: "var(--fg)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
          <strong style={{ fontWeight: 600 }}>
            {last ? `Prova Pro: ${t.daysLeft === 1 ? "ultimo giorno" : "ultimi 2 giorni"}` : `Prova Pro attiva · ${t.daysLeft} giorni`}
          </strong>
          <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
            {last ? `Scade il ${ends}. Poi solo visualizzazione: continua con Pro per non fermare le candidature.` : `Fino al ${ends} LavorAI si candida per te ogni giorno. Nessuna carta richiesta.`}
          </span>
        </div>
        <div style={{ height: 3, borderRadius: 999, background: "var(--border-ds)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: last ? "var(--amber)" : "hsl(var(--primary))", borderRadius: 999 }} />
        </div>
      </div>
      <Link href="/settings#billing" className={`ds-btn ds-btn-sm ${last ? "ds-btn-primary" : ""}`} style={{ flexShrink: 0 }}>
        {last ? "Continua con Pro" : "Dettagli"}
      </Link>
    </div>
  );
}
