"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Icon } from "@/components/design/icon";
import { companyColor } from "@/components/design/company-logo";
import { GmailConnectModal } from "@/components/gmail-connect-modal";
import { filterInboxMessages, inboxSourceLabel, type InboxFilter, type InboxMessage } from "@/lib/inbox-message";

export type GmailInboxMessage = InboxMessage;
interface InboxViewProps {
  messages: InboxMessage[];
  gmailConnected: boolean;
  userEmail: string | null;
  locale?: string;
}
type ManualStatus = "inviata" | "vista" | "colloquio" | "offerta" | "rifiutata";
const statusOptions: Array<[ManualStatus, string]> = [
  ["inviata", "Applied"], ["vista", "Viewed"], ["colloquio", "Interviewing"],
  ["offerta", "Offer"], ["rifiutata", "Not this time"],
];
const fmtDate = (iso: string) => new Date(iso).toLocaleString("en-GB", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC",
}) + " UTC";

export function GmailInboxView({ messages, gmailConnected, userEmail, locale = "en" }: InboxViewProps) {
  const en = locale === "en";
  const tr = (english: string, italian: string) => en ? english : italian;
  const kindLabel = (kind: string, fallback: string) => en ? fallback : ({ colloquio: "Possibile colloquio", risposta: "Possibile risposta recruiter", rifiutata: "Possibile rifiuto", ricevuta: "Ricevuta candidatura", bounce: "Errore di consegna", auto: "Messaggio automatico" }[kind] ?? "Non classificato");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const syncInFlight = useRef(false);
  const [refreshing, startRefresh] = useTransition();
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [showGmailModal, setShowGmailModal] = useState(false);
  const [inboxFilter, setInboxFilter] = useState<"inbox" | "all">("inbox");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [savedStatuses, setSavedStatuses] = useState<Record<string, ManualStatus>>({});
  const [savingStatus, setSavingStatus] = useState(false);
  const statusInFlight = useRef(false);

  const filtered = useMemo(() => filterInboxMessages(messages, {
    kind: filter, search, jobOnly: inboxFilter === "inbox", oldestFirst: sortOrder === "oldest",
  }), [messages, filter, search, inboxFilter, sortOrder]);
  const current = filtered.find((message) => message.id === selected) ?? filtered[0] ?? null;
  const interviewCount = messages.filter((message) => message.jobRelated && message.kind === "colloquio").length;
  const currentStatus = current?.applicationId
    ? savedStatuses[current.applicationId] ?? current.applicationStatus ?? ""
    : "";

  // Refresh received webhooks without requiring Gmail sync or a page reload.
  // This only reads the local inbox; Gmail sync remains a separate explicit action.
  useEffect(() => {
    const refreshVisible = () => {
      if (!document.hidden) startRefresh(() => router.refresh());
    };
    const timer = window.setInterval(refreshVisible, 60_000);
    window.addEventListener("focus", refreshVisible);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refreshVisible); };
  }, [router]);

  const handleRefresh = () => startRefresh(() => router.refresh());
  const handleSyncGmail = async () => {
    if (!gmailConnected || syncInFlight.current) return;
    syncInFlight.current = true;
    setSyncing(true);
    setSyncNotice(null);
    try {
      const response = await fetch("/api/gmail/sync", { method: "POST" });
      const data = await response.json();
      setSyncNotice(response.ok ? (en ? `Gmail sync complete: ${data.synced ?? 0} new messages.` : `Sincronizzazione Gmail completata: ${data.synced ?? 0} nuovi messaggi.`) : data.error || "Gmail sync failed.");
      if (response.ok) handleRefresh();
    } catch {
      setSyncNotice("Couldn't sync Gmail. Try again.");
    } finally {
      syncInFlight.current = false;
      setSyncing(false);
    }
  };

  const handleStatusChange = async (status: ManualStatus) => {
    const applicationId = current?.applicationId;
    if (!applicationId || !status || statusInFlight.current) return;
    statusInFlight.current = true;
    setSavingStatus(true);
    try {
      const response = await fetch(`/api/applications/${encodeURIComponent(applicationId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userStatus: status }),
      });
      if (!response.ok) {
        toast.error(tr("Couldn't update the application status.", "Impossibile aggiornare lo stato della candidatura."));
        return;
      }
      // Key by application, so a late request cannot change another message's status.
      setSavedStatuses((previous) => ({ ...previous, [applicationId]: status }));
      toast.success(tr("Application status updated.", "Stato candidatura aggiornato."));
    } catch {
      toast.error(tr("Network error. Try again.", "Errore di rete. Riprova."));
    } finally {
      statusInFlight.current = false;
      setSavingStatus(false);
    }
  };

  useEffect(() => {
    const gmailParam = searchParams.get("gmail");
    if (gmailParam !== "linked" && gmailParam !== "error") return;
    const reason = searchParams.get("reason");
    if (gmailParam === "linked") {
      setSyncNotice("Gmail connected. Use Sync Gmail to fetch messages from your account.");
      router.refresh();
    } else {
      const errors: Record<string, string> = {
        denied: "Gmail connection cancelled. Messages received by LavorAI are still available here.",
        email_mismatch: `Use the same Google email as your LavorAI account (${userEmail ?? "your account"}).`,
        account_already_linked: "This Google account is already linked to another LavorAI account.",
        state_expired: "The connection request expired. Try connecting Gmail again.",
        invalid_state: "The connection request could not be verified. Try again.",
      };
      setSyncNotice((reason && errors[reason]) || "Couldn't connect Gmail. Try again.");
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("gmail");
    url.searchParams.delete("reason");
    window.history.replaceState({}, "", url.toString());
  }, [searchParams, router, userEmail]);

  return (
    <div className="workspace-inbox">
      <GmailConnectModal open={showGmailModal} onClose={() => setShowGmailModal(false)} />
      <header className="inbox-toolbar">
        <h1>Inbox <span className="workspace-chip">{messages.length} {tr("messages", "messaggi")}</span></h1>
        <button type="button" onClick={handleRefresh} disabled={refreshing} className="ds-btn">{refreshing ? tr("Refreshing…", "Aggiornamento…") : tr("Refresh inbox", "Aggiorna inbox")}</button>
        {gmailConnected
          ? <button type="button" onClick={handleSyncGmail} disabled={syncing} className="ds-btn">{syncing ? tr("Syncing Gmail…", "Sincronizzazione…") : tr("Sync Gmail", "Sincronizza Gmail")}</button>
          : <button type="button" onClick={() => setShowGmailModal(true)} className="ds-btn"><Icon name="inbox" size={14} /> {tr("Connect Gmail (optional)", "Collega Gmail (facoltativo)")}</button>}
      </header>
      {syncNotice && <div role="status" className="inbox-toolbar">{syncNotice}</div>}
      <div className="inbox-layout">
        <div className="inbox-list">
          <div className="inbox-list-tools">
            <input aria-label={tr("Search inbox", "Cerca nella inbox")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr("Search recruiter or company…", "Cerca recruiter o azienda…")} />
            <select aria-label={tr("Mailbox", "Casella")} value={inboxFilter} onChange={(event) => setInboxFilter(event.target.value as "inbox" | "all")}>
              <option value="inbox">{tr("Application mail", "Email candidature")}</option><option value="all">{tr("All saved mail", "Tutte le email salvate")}</option>
            </select>
            <select aria-label={tr("Message type", "Tipo di messaggio")} value={filter} onChange={(event) => setFilter(event.target.value as InboxFilter)}>
              <option value="all">{tr("All labels", "Tutte le categorie")}</option>
              {[["colloquio", "Possible interviews"], ["risposta", "Possible recruiter replies"], ["ricevuta", "Application receipts"], ["rifiutata", "Possible rejections"], ["bounce", "Delivery failures"], ["auto", "Automated messages"]].map(([value, label]) => <option key={value} value={value}>{kindLabel(value, label)}</option>)}
            </select>
            <select aria-label={tr("Sort messages", "Ordina messaggi")} value={sortOrder} onChange={(event) => setSortOrder(event.target.value as "newest" | "oldest")}>
              <option value="newest">{tr("Newest", "Più recenti")}</option><option value="oldest">{tr("Oldest", "Meno recenti")}</option>
            </select>
          </div>
          <div className="inbox-message-list" aria-label={tr("Messages", "Messaggi")}>
            {filtered.length === 0 ? <div className="workspace-empty">{messages.length
              ? tr("No messages match your filters.", "Nessun messaggio corrisponde ai filtri.")
              : tr("No replies yet. Messages received by LavorAI will appear here.", "Nessuna risposta per ora. I messaggi ricevuti da LavorAI compariranno qui.")}</div>
              : filtered.map((message) => <button key={message.id} type="button" className="inbox-message" onClick={() => setSelected(message.id)} aria-pressed={message.id === current?.id}>
                <div className="inbox-message-sender"><span className="inbox-avatar" aria-hidden="true">{(message.company || message.from).slice(0, 2).toUpperCase()}</span><div><strong style={{ fontWeight: message.read === false ? 750 : 500 }}>{message.from.split("<")[0].trim() || message.from}</strong>
                {message.company && <small>{message.company}</small>}</div></div>
                <p>{message.subject || tr("(no subject)", "(senza oggetto)")}</p>
                <p className="fit-ellipsis workspace-muted">{message.snippet}</p>
                <div className="inbox-message-meta"><span className="workspace-chip">{kindLabel(message.kind, message.label)}</span><small title={inboxSourceLabel(message.source)}>{fmtDate(message.date)}</small></div>
              </button>)}
          </div>
        </div>
        <section aria-label={tr("Message details", "Dettagli messaggio")} className="inbox-reader">
          {!current ? <div className="workspace-empty">{tr("Select a message", "Seleziona un messaggio")}</div> : <>
            <div className="inbox-reader-head">
              <div className="workspace-eyebrow">{tr("Received message", "Messaggio ricevuto")}</div>
              <h2>{current.subject || tr("(no subject)", "(senza oggetto)")}</h2>
              <p className="workspace-muted">{current.from}</p>

            </div>
            <div className="inbox-conversation"><div className="inbox-date-divider">{fmtDate(current.date)}</div><div className="inbox-body" data-testid="message-body">{current.bodyText || current.snippet || tr("No content", "Nessun contenuto")}</div></div>
            <div className="inbox-source-note">
              {current.source === "application_reply"
                ? tr("Received directly by LavorAI. Read and archive state are not tracked for these messages.", "Ricevuto direttamente da LavorAI. Lettura e archiviazione non sono tracciate per questi messaggi.")
                : tr("Saved from Gmail. Opening this copy does not mark it read or change your Gmail mailbox.", "Salvato da Gmail. Aprire questa copia non cambia lo stato di lettura o la casella Gmail.")}
              {" "}{tr("Sending replies from this inbox is not available.", "L'invio di risposte da questa inbox non è disponibile.")}
            </div>
          </>}
        </section>
        <aside className="inbox-context workspace-stack" aria-label={tr("Application context", "Contesto candidatura")}>
          <section className="workspace-panel">
            <div className="workspace-eyebrow">{tr("Related application", "Candidatura collegata")}</div>
            {current?.company ? <>
              <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "12px 0" }}>
                <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 36, height: 36, flexShrink: 0, borderRadius: 8, color: "white", background: companyColor(current.company) }}>{current.company.slice(0, 2)}</span>
                <strong>{current.company}</strong>
              </div>
              <p className="workspace-muted">{current.jobTitle}</p>
            </> : <p className="workspace-muted">{tr("No company linked to this message.", "Nessuna azienda collegata al messaggio.")}</p>}
            {current?.applicationId && <>
              <Link href={`/applications?id=${encodeURIComponent(current.applicationId)}`} className="ds-btn ds-btn-primary" style={{ marginTop: 16 }}>{tr("View application", "Vedi candidatura")}</Link>
              <label>{tr("Manual application status", "Stato manuale candidatura")}
                <select aria-label={tr("Manual application status", "Stato manuale candidatura")} value={statusOptions.some(([value]) => value === currentStatus) ? currentStatus : ""} disabled={savingStatus}
                  onChange={(event) => handleStatusChange(event.target.value as ManualStatus)}>
                  <option value="" disabled>{tr("Set status…", "Imposta stato…")}</option>
                  {statusOptions.map(([value, label]) => <option key={value} value={value}>{en ? label : ({ inviata: "Inviata", vista: "Vista", colloquio: "Colloquio", offerta: "Offerta", rifiutata: "Rifiutata" }[value])}</option>)}
                </select>
              </label>
            </>}
          </section>
          <section className="workspace-panel">
            <h2>{tr("Message classification", "Classificazione messaggio")}</h2>
            {current && <span className="workspace-chip">{kindLabel(current.kind, current.label)}</span>}
            <p className="workspace-muted" style={{ marginTop: 10 }}>{tr("Labels are automatic estimates. An interview or reply label does not verify who wrote the message.", "Le categorie sono stime automatiche. Un'etichetta colloquio o risposta non verifica chi ha scritto il messaggio.")}</p>
            {interviewCount > 0 && <button type="button" className="ds-btn" style={{ marginTop: 12 }} onClick={() => setFilter("colloquio")}>{tr("Possible interviews", "Possibili colloqui")} · {interviewCount}</button>}
          </section>
          <section className="workspace-panel workspace-muted">
            <h2>{tr("Your inbox", "La tua inbox")}</h2>
            <p>{tr("Replies sent to your LavorAI application address appear here without Gmail. Previously synced Gmail messages are also kept here.", "Le risposte all'indirizzo candidature LavorAI arrivano qui anche senza Gmail. Le email Gmail già sincronizzate restano disponibili.")}</p>
            <p style={{ marginTop: 10 }}>{tr("Up to 200 recent messages per source. Security-code messages are hidden.", "Fino a 200 messaggi recenti per fonte. I messaggi con codici di sicurezza sono nascosti.")}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
