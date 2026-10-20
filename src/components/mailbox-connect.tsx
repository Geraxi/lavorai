"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Mail, Unplug, ShieldCheck, FlaskConical } from "lucide-react";
import "./mailbox.css";
import { connectAction } from "@/lib/mailbox/connect-ui";

type Status = {
  connections: { provider: "gmail" | "outlook"; email: string; status: string }[];
  mode: { live: boolean; reason?: string };
  configured: { gmail: boolean; outlook: boolean };
};
const fetcher = (u: string) => fetch(u).then((r) => r.json());
const NAME = { gmail: "Gmail", outlook: "Outlook / Microsoft 365" } as const;

/** Impostazioni → collega la tua casella per inviare le candidature a tuo nome. */
export function MailboxConnect({ notice }: { notice?: string | null }) {
  const { data, mutate } = useSWR<Status>("/api/mailbox/status", fetcher);
  const [busy, setBusy] = useState<string | null>(null);
  async function disconnect(provider: "gmail" | "outlook") {
    setBusy(provider);
    const r = await fetch("/api/mailbox/disconnect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider }) });
    setBusy(null);
    if (r.ok) { toast.success("Casella scollegata."); mutate(); } else toast.error("Impossibile scollegare la casella.");
  }
  const NOTICE: Record<string, string> = {
    connected: "Casella collegata. Ogni invio richiederà comunque la tua approvazione.",
    denied: "Collegamento annullato: nessun permesso concesso.",
    missing_scope: "Permessi incompleti: servono sia l'invio sia la lettura dei thread (per rilevare i rimbalzi). Ricollega e lascia selezionati entrambi.",
    not_configured: "Collegamento non ancora disponibile su questo server.",
    error: "Collegamento non riuscito. Riprova.",
  };
  return (
    <div className="mbx">
      <p className="mbx-lead">Le candidature partono dalla <strong>tua</strong> casella, con il tuo indirizzo: il recruiter risponde direttamente a te e le trovi nella cartella Inviati. Prima di ogni invio vedi destinatario e allegati e lo approvi tu.</p>
      {notice && NOTICE[notice] && <p className={`mbx-notice${notice === "connected" ? " is-ok" : ""}`} role="status">{NOTICE[notice]}</p>}
      <ul className="mbx-list">
        {(["gmail", "outlook"] as const).map((p) => {
          const c = data?.connections.find((x) => x.provider === p);
          const action = connectAction(p, data);
          // Provider non configurato e mai collegato (es. Outlook senza app Azure): niente riga "Non collegata".
          const status = c ? `${c.email}${c.status !== "active" ? " · da ricollegare" : " · collegata"}` : action === "soon" ? "Arriverà a breve" : action === "unavailable" ? "Non disponibile su questo server" : "Non collegata";
          return (
            <li key={p} className="mbx-row">
              <span className="mbx-icon"><Mail size={16} strokeWidth={1.75} aria-hidden /></span>
              <span className="mbx-text">
                <strong>{NAME[p]}</strong>
                <small>{status}</small>
              </span>
              {action === "disconnect" && <button type="button" className="pm-btn-ghost" disabled={busy === p} onClick={() => disconnect(p)}><Unplug size={13} strokeWidth={1.75} aria-hidden /> Scollega</button>}
              {(action === "connect" || action === "reconnect") && <a className="pm-btn-ghost" href={`/api/mailbox/connect?provider=${p}`}>{action === "reconnect" ? "Ricollega" : "Collega"}</a>}
              {action === "soon" && <span className="pm-pill tone-neutral mbx-soon">Presto disponibile</span>}
              {action === "unavailable" && <span className="pm-pill tone-neutral mbx-soon">Non disponibile</span>}
              {action === "loading" && <span className="mbx-soon" aria-hidden />}
            </li>
          );
        })}
      </ul>
      <p className="mbx-foot"><ShieldCheck size={13} strokeWidth={1.75} aria-hidden /> Chiediamo il permesso di inviare e di leggere la posta: leggiamo solo mittente e oggetto dei thread delle candidature inviate, per rilevare email rimbalzate. Puoi scollegare in qualsiasi momento.</p>
      {data && !data.mode.live && <p className="mbx-foot"><FlaskConical size={13} strokeWidth={1.75} aria-hidden /> Ambiente di prova: gli invii sono simulati e nessuna email esce dal server.</p>}
    </div>
  );
}
