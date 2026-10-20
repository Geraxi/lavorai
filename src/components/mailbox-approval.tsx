"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { toast } from "sonner";
import { FileText, FlaskConical, Mail, Send, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/ui-premium/empty-state";
import "./mailbox.css";

type Data = {
  mode: { live: boolean; reason?: string };
  connection: { provider: string; email: string } | null;
  eligible: { id: string; job: { title: string; company: string | null } }[];
  sends: { id: string; recipient: string; subject: string; fromAddress: string; provider: string; attachments: string[]; application: { job: { title: string; company: string | null } } }[];
};
const fetcher = (u: string) => fetch(u).then((r) => r.json());
const SKIP: Record<string, string> = {
  no_mailbox: "nessuna casella collegata", no_cv_pdf: "CV PDF mancante", no_cover_letter: "lettera mancante",
  no_verified_recipient: "nessun indirizzo email verificato sulla pagina dell'annuncio", already_sent: "già inviata", already_prepared: "già preparata", not_found: "non trovata",
};

/** Approvazione esplicita: l'utente vede e conferma OGNI destinatario prima dell'invio. */
export function MailboxApproval() {
  const { data, mutate } = useSWR<Data>("/api/applications/mailbox/send", fetcher);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const selected = useMemo(() => (data?.sends ?? []).filter((s) => picked.has(s.id)), [data, picked]);

  async function prepare(ids: string[]) {
    setBusy(true);
    const r = await fetch("/api/applications/mailbox/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationIds: ids }) });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.error("Preparazione non riuscita."); return; }
    if (b.prepared?.length) toast.success(`${b.prepared.length} email preparate: controllale e approvale.`);
    for (const s of b.skipped ?? []) toast.message(`Non preparata: ${SKIP[s.reason] ?? s.reason}.`);
    mutate();
  }

  async function send() {
    setBusy(true);
    const r = await fetch("/api/applications/mailbox/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: selected.map((s) => ({ id: s.id, recipient: s.recipient })) }) });
    const b = await r.json().catch(() => ({}));
    setBusy(false); setReviewing(false); setPicked(new Set());
    if (!r.ok) { toast.error(b.error === "recipient_mismatch" ? "Un destinatario è cambiato: ricontrolla l'elenco." : "Invio non approvato."); mutate(); return; }
    const vals = Object.values(b.results ?? {}) as string[];
    const n = (k: string) => vals.filter((v) => v === k).length;
    const parts = [n("submitted") && `${n("submitted")} accettate dal provider`, n("dry_run") && `${n("dry_run")} simulate (nessun invio reale)`, n("failed") && `${n("failed")} non inviate`, n("unverified") && `${n("unverified")} con esito da verificare`].filter(Boolean);
    toast.success(parts.join(" · ") || "Nessun invio eseguito.");
    mutate();
  }

  if (!data) return <section className="pm-card"><p className="pm-muted" style={{ padding: 20 }}>Caricamento…</p></section>;

  return (
    <div className="mbx-approve">
      {!data.connection ? (
        <section className="pm-card"><EmptyState icon={Mail} title="Collega la tua casella" text="Per inviare candidature a tuo nome collega Gmail o Outlook nelle Impostazioni." cta={{ href: "/settings#mailbox", label: "Vai alle Impostazioni" }} /></section>
      ) : (
        <p className="mbx-mode"><Mail size={13} strokeWidth={1.75} aria-hidden /> Invio da <strong>{data.connection.email}</strong>{!data.mode.live && <><span aria-hidden>·</span><FlaskConical size={13} strokeWidth={1.75} aria-hidden /> modalità di prova: nessuna email reale</>}</p>
      )}

      <section className="pm-card" aria-label="Email da approvare">
        <header className="pm-card-head">
          <h2><ShieldCheck size={15} strokeWidth={1.75} aria-hidden /> Da approvare <span className="pm-count">{data.sends.length}</span></h2>
          <button type="button" className="pm-btn-primary" disabled={!selected.length || busy} onClick={() => setReviewing(true)}><Send size={13} strokeWidth={1.75} aria-hidden /> Rivedi e invia ({selected.length})</button>
        </header>
        {data.sends.length === 0 ? <p className="pm-muted" style={{ padding: "4px 20px 18px" }}>Nessuna email in attesa. Prepara una candidatura qui sotto.</p> : (
          <ul className="mbx-table">
            {data.sends.map((s) => (
              <li key={s.id} className="mbx-item">
                <input type="checkbox" aria-label={`Seleziona ${s.application.job.title}`} checked={picked.has(s.id)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n; })} />
                <span><strong style={{ fontSize: 13.5, fontWeight: 500 }}>{s.application.job.company ?? "—"}</strong><small>{s.subject}</small></span>
                <span className="mbx-to" title={s.recipient}>→ {s.recipient}</span>
                <span className="mbx-files">{s.attachments.map((f) => <span key={f} className="mbx-file"><FileText size={12} strokeWidth={1.75} aria-hidden />{f.endsWith(".pdf") ? "CV PDF" : "Lettera"}</span>)}</span>
              </li>
            ))}
          </ul>
        )}
        {reviewing && (
          <div className="pm-card" role="dialog" aria-modal="false" aria-labelledby="mbx-review-title" style={{ margin: "0 20px 20px", padding: 18 }}>
            <h3 id="mbx-review-title" style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>Confermi l&apos;invio di {selected.length} {selected.length === 1 ? "email" : "email"} da {data.connection?.email}?</h3>
            <ol className="mbx-confirm-list">{selected.map((s) => <li key={s.id}>{s.application.job.company ?? "—"}, {s.application.job.title}: <code>{s.recipient}</code></li>)}</ol>
            <p className="pm-muted" style={{ fontSize: 12, margin: "10px 0 14px" }}>Ogni email contiene la lettera nel testo e il CV PDF in allegato. Verrà inviata una sola volta: in caso di esito incerto non ritentiamo in automatico.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="pm-btn-primary" disabled={busy} onClick={send}><Send size={13} strokeWidth={1.75} aria-hidden /> {busy ? "Invio…" : `Conferma e invia (${selected.length})`}</button>
              <button type="button" className="pm-btn-ghost" onClick={() => setReviewing(false)}>Annulla</button>
            </div>
          </div>
        )}
      </section>

      <section className="pm-card" aria-label="Candidature pronte">
        <header className="pm-card-head"><h2><FileText size={15} strokeWidth={1.75} aria-hidden /> Pronte da preparare <span className="pm-count">{data.eligible.length}</span></h2>
          {data.eligible.length > 0 && data.connection && <button type="button" className="pm-btn-ghost" disabled={busy} onClick={() => prepare(data.eligible.map((e) => e.id))}>Prepara tutte</button>}
        </header>
        {data.eligible.length === 0 ? <p className="pm-muted" style={{ padding: "4px 20px 18px" }}>Nessuna candidatura con CV PDF e lettera pronti. <Link href="/applications">Vai alle candidature</Link></p> : (
          <ul className="mbx-table">{data.eligible.map((e) => (
            <li key={e.id} className="mbx-item" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
              <span><strong style={{ fontSize: 13.5, fontWeight: 500 }}>{e.job.company ?? "—"}</strong><small>{e.job.title}</small></span>
              <button type="button" className="pm-btn-ghost" disabled={busy || !data.connection} onClick={() => prepare([e.id])}>Prepara email</button>
            </li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}
