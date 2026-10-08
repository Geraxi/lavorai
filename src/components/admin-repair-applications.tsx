"use client";
import { useState } from "react";
export function AdminRepairApplications({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function repair() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/repair-applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({userId}) });
      if (!response.ok) throw new Error("Riparazione non riuscita.");
      const result = await response.json();
      setMessage(`${result.answersRecovered} risposte recuperate dal CV · ${result.unconfirmedCorrected} invii non confermati riclassificati. Nessuna candidatura inviata.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Errore"); }
    finally { setBusy(false); }
  }
  return <div><button className="adm-btn" disabled={busy} onClick={repair}>{busy ? "Riparazione…" : "Recupera risposte CV e correggi stati"}</button><p role="status" style={{ fontSize: 12, whiteSpace: "normal" }}>{message}</p></div>;
}
