"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, RotateCcw, Ban, Trash2, CheckCircle2 } from "lucide-react";

/**
 * Azioni sul singolo utente nel pannello dettaglio admin. Ogni azione
 * distruttiva chiede conferma; "Elimina" richiede di digitare l'email.
 */
export function UserActions({ id, email, suspended }: { id: string; email: string; suspended: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function call(action: string) {
    setBusy(action);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/users/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.message ?? `Errore (${r.status})`); return; }
      if (action === "delete") {
        setMsg(`Utente eliminato (${j.cancelledApplications ?? 0} candidature annullate).`);
        router.push("/admin/users");
        router.refresh();
        return;
      }
      setMsg(action === "suspend" ? "Utente sospeso." : action === "unsuspend" ? "Sospensione rimossa." : "Crediti del mese azzerati.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, paddingTop: 10, flexShrink: 0 }}>
        <a href={`mailto:${email}`} className="adm-btn sm" style={{ justifyContent: "center", textDecoration: "none" }}><Mail size={11} />Invia email</a>
        <button type="button" className="adm-btn sm" style={{ justifyContent: "center" }} disabled={!!busy} onClick={() => { if (window.confirm(`Azzerare il contatore mensile di ${email}? Da oggi riparte da 0.`)) void call("reset_credits"); }}>
          <RotateCcw size={11} />{busy === "reset_credits" ? "…" : "Reset crediti"}
        </button>
        {suspended ? (
          <button type="button" className="adm-btn sm" style={{ justifyContent: "center", color: "hsl(var(--primary))" }} disabled={!!busy} onClick={() => void call("unsuspend")}>
            <CheckCircle2 size={11} />{busy === "unsuspend" ? "…" : "Riattiva"}
          </button>
        ) : (
          <button type="button" className="adm-btn sm" style={{ justifyContent: "center", color: "var(--amber)" }} disabled={!!busy} onClick={() => { if (window.confirm(`Sospendere ${email}? Non potrà più accedere e l'auto-apply viene spento.`)) void call("suspend"); }}>
            <Ban size={11} />{busy === "suspend" ? "…" : "Sospendi"}
          </button>
        )}
        <button type="button" className="adm-btn sm" style={{ justifyContent: "center", color: "#f87171" }} disabled={!!busy} onClick={() => { const typed = window.prompt(`Eliminare DEFINITIVAMENTE ${email} con tutte le candidature, i CV e i file? Scrivi l'email per confermare.`); if (typed && typed.trim().toLowerCase() === email.toLowerCase()) void call("delete"); else if (typed !== null) setMsg("Email non corrispondente: nessuna eliminazione."); }}>
          <Trash2 size={11} />{busy === "delete" ? "Elimino…" : "Elimina"}
        </button>
      </div>
      {msg && <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--fg-muted)" }}>{msg}</div>}
    </>
  );
}
