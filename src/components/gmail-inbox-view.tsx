"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Archive, ArrowDownWideNarrow, ArrowLeft, BriefcaseBusiness, ChevronLeft, ChevronRight, CircleAlert, FilePenLine, Inbox, Mail, RefreshCw, Reply, Search, Send, X } from "lucide-react";
import { GmailConnectModal } from "@/components/gmail-connect-modal";
import { filterInboxMessages, inboxThreadKey, type InboxFilter, type InboxMessage, type InboxOutgoing } from "@/lib/inbox-message";
import "./design/inbox-mailbox.css";

export type GmailInboxMessage = InboxMessage;
interface InboxViewProps { messages: InboxMessage[]; gmailConnected: boolean; userEmail: string | null; locale?: string; ownerId?: string; outgoing?: InboxOutgoing[] }
type Folder = "inbox" | "sent" | "drafts" | "all";
const PAGE_SIZE = 20;
const senderName = (from: string) => from.split("<")[0].trim().replace(/^"|"$/g, "") || from;
const fmtDate = (date: string, en: boolean, full = false) => new Date(date).toLocaleString(en ? "en-GB" : "it-IT", { day: "numeric", month: "short", ...(full ? { hour: "2-digit", minute: "2-digit" } : {}) });
const statusText = (status: string, en: boolean) => ({ draft: ["Draft", "Bozza"], sending: ["Sending · confirmation pending", "Invio · conferma in attesa"], accepted: ["Sent · delivery pending", "Inviata · consegna in attesa"], delivered: ["Delivered to recipient server", "Consegnata al server destinatario"], delayed: ["Delivery delayed", "Consegna in ritardo"], bounced: ["Not delivered · bounced", "Non consegnata · respinta"], failed: ["Not sent / failed", "Invio non riuscito"], complained: ["Reported as spam", "Segnalata come spam"], unknown: ["Send status unknown", "Esito invio sconosciuto"] }[status]?.[en ? 0 : 1] ?? status);
function errorText(code: string, en: boolean): string {
  const errors: Record<string, [string, string]> = {
    email_quota_reached: ["Email sending limit reached. Your draft is safe. Try again after the quota resets or contact support.", "Limite di invio email raggiunto. La bozza è conservata. Riprova al rinnovo della quota o contatta l'assistenza."],
    reply_rate_limited: ["You can send up to 10 replies per hour. Keep this draft and try later.", "Puoi inviare fino a 10 risposte all'ora. Conserva la bozza e riprova più tardi."],
    sending_paused: ["Email sending is temporarily paused. Your draft is saved; contact support or try later.", "L'invio email è temporaneamente sospeso. La bozza è salvata: contatta l'assistenza o riprova più tardi."],
    gmail_read_only: ["Gmail is connected for reading. Open the original in Gmail to reply.", "Gmail è collegato in sola lettura. Apri l'originale in Gmail per rispondere."],
    message_not_replyable: ["This address does not accept replies. Check the message for another way to contact the company.", "Questo indirizzo non accetta risposte. Cerca nel messaggio un altro contatto dell'azienda."],
    thread_metadata_unavailable: ["The original email's reply details are unavailable. Contact support to restore them.", "I dettagli di risposta dell'email originale non sono disponibili. Contatta l'assistenza per recuperarli."],
    reply_routing_unverified: ["This forwarded message cannot be safely replied to here. Reply from the original mailbox.", "Non è possibile rispondere in sicurezza a questo messaggio inoltrato. Rispondi dalla casella originale."],
    reply_service_unavailable: ["Replies are temporarily unavailable. Keep your draft and try again, or contact support.", "Le risposte sono temporaneamente non disponibili. Conserva la bozza e riprova, oppure contatta l'assistenza."],
    provider_rejected: ["The email service rejected this reply. Your text is saved. Contact support before retrying.", "Il servizio email ha rifiutato la risposta. Il testo è salvato. Contatta l'assistenza prima di riprovare."],
    send_status_unknown: ["The send could not be confirmed. Do not create a duplicate. Retry this same reply within 23 hours, or contact support.", "Non è stato possibile confermare l'invio. Non creare un duplicato. Riprova questa stessa risposta entro 23 ore o contatta l'assistenza."],
    account_access_required: ["Check your account access before sending. Your draft remains here.", "Verifica l'accesso al tuo account prima di inviare. La bozza resta qui."],
    unauthenticated: ["Sign in again to reply. Your draft remains in this browser tab.", "Accedi di nuovo per rispondere. La bozza resta in questa scheda del browser."],
    draft_limit_reached: ["You have 20 saved drafts. Send or discard an existing draft before saving another.", "Hai 20 bozze salvate. Invia o elimina una bozza esistente prima di salvarne un'altra."],
  };
  return errors[code]?.[en ? 0 : 1] ?? (en ? "Couldn't complete the request. Your draft is kept. Try again." : "Richiesta non completata. La bozza è conservata. Riprova.");
}

function ReplyComposer({ message, ownerId, en, initial, onSaved, onDiscarded }: { message: InboxMessage; ownerId: string; en: boolean; initial?: InboxOutgoing; onSaved: (reply: InboxOutgoing) => void; onDiscarded: (id: string) => void }) {
  const key = `lavorai-reply:${ownerId}:${message.id}`;
  const [body, setBody] = useState(initial?.bodyText ?? "");
  const [id, setId] = useState(initial?.id ?? "");
  const [context, setContext] = useState<{ recipient: string; subject: string } | null>(initial ? { recipient: initial.recipient, subject: initial.subject } : null);
  const [result, setResult] = useState<InboxOutgoing | undefined>(initial);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [notice, setNotice] = useState("");
  const [contextError, setContextError] = useState("");
  const locked = !!result && result.status !== "draft";
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
      if (!initial && saved?.body && typeof saved.id === "string") { setBody(saved.body); setId(saved.id); }
      else if (!initial) setId(crypto.randomUUID());
    } catch { setId(initial?.id ?? crypto.randomUUID()); }
    const controller = new AbortController();
    fetch(`/api/inbox/replies?parentId=${encodeURIComponent(message.id)}`, { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setContext(data);
    }).catch(error => { if (error.name !== "AbortError") setContextError(errorText(error.message, en)); });
    return () => controller.abort();
  }, [key, message.id, en]); // A selected draft has a stable composer identity.
  const edit = (value: string) => { setBody(value); setNotice(""); try { sessionStorage.setItem(key, JSON.stringify({ id, body: value })); } catch { /* memory still retains the draft */ } };
  const submit = async (action: "draft" | "send") => {
    if (inFlight.current || !id || !body.trim()) return;
    inFlight.current = true; setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/inbox/replies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, parentId: message.id, body, action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setResult(data.reply); onSaved(data.reply);
      setNotice(data.reply.failureCode ? errorText(data.reply.failureCode, en) : statusText(data.reply.status, en));
      if (["accepted", "delivered", "delayed"].includes(data.reply.status)) sessionStorage.removeItem(key);
    } catch (error) { setNotice(errorText(error instanceof Error ? error.message : "network", en)); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const discard = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      if (result?.status === "draft") {
        const response = await fetch(`/api/inbox/replies?id=${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!response.ok) throw new Error("draft_unavailable");
        onDiscarded(id);
      }
      sessionStorage.removeItem(key); setBody(""); setResult(undefined); setId(crypto.randomUUID()); setNotice("");
    } catch { setNotice(en ? "Couldn't discard the draft. Try again." : "Impossibile eliminare la bozza. Riprova."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const restartRejected = () => { const next = crypto.randomUUID(); setId(next); setResult(undefined); setNotice(""); try { sessionStorage.setItem(key, JSON.stringify({ id: next, body })); } catch {} };
  return <section className="mail-compose" aria-label={en ? "Reply composer" : "Scrivi risposta"}>
    <header><Reply size={16} /><strong>{en ? "Reply" : "Rispondi"}</strong></header>
    <div className="mail-recipient"><span>{en ? "To" : "A"}</span><span>{context?.recipient ?? (en ? "Checking reply address…" : "Verifica indirizzo…")}</span></div>
    {contextError && <p role="alert" className="mail-notice">{contextError}</p>}
    <textarea aria-label={en ? "Reply message" : "Testo risposta"} value={body} onChange={event => edit(event.target.value)} maxLength={10000} readOnly={locked} placeholder={en ? "Write your reply…" : "Scrivi la tua risposta…"} />
    <div className="mail-compose-note">{en ? "Sent via LavorAI. Replies return to this application conversation." : "Inviata tramite LavorAI. Le risposte tornano nella conversazione di questa candidatura."}</div>
    {(notice || locked) && <p role="status" className="mail-notice">{notice || statusText(result!.status, en)}</p>}
    <footer>
      {(!locked || ["unknown", "sending"].includes(result!.status)) && <button type="button" className="mail-send" disabled={busy || !context || !!contextError || !body.trim()} onClick={() => submit("send")}><Send size={15} />{busy ? (en ? "Please wait…" : "Attendi…") : locked ? (en ? "Retry same reply" : "Riprova stessa risposta") : (en ? "Send reply" : "Invia risposta")}</button>}
      {!locked && <button type="button" className="mail-text-button" disabled={busy || !context || !!contextError || !body.trim()} onClick={() => submit("draft")}>{en ? "Save draft" : "Salva bozza"}</button>}
      {!locked && <button type="button" className="mail-text-button" disabled={busy || !body} onClick={discard}>{en ? "Discard" : "Elimina"}</button>}
      {result?.status === "failed" && ["email_quota_reached", "provider_rejected"].includes(result.failureCode ?? "") && <button type="button" className="mail-text-button" onClick={restartRejected}>{en ? "Edit and retry rejected reply" : "Modifica e riprova la risposta rifiutata"}</button>}
      <small>{body.length.toLocaleString()} / 10,000</small>
    </footer>
  </section>;
}

export function GmailInboxView({ messages: initialMessages, gmailConnected, userEmail, locale = "en", ownerId = "current", outgoing = [] }: InboxViewProps) {
  const en = locale === "en"; const tr = (a: string, b: string) => en ? a : b;
  const router = useRouter(); const searchParams = useSearchParams();
  const [attentionState, setAttentionState] = useState<Record<string, Partial<InboxMessage>>>({});
  const [attentionBusy, setAttentionBusy] = useState(false);
  const messages = useMemo(() => initialMessages.map(m => ({ ...m, ...attentionState[m.id] })), [initialMessages, attentionState]);
  const [folder, setFolder] = useState<Folder>("inbox");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [search, setSearch] = useState(""); const [oldest, setOldest] = useState(false);
  const [page, setPage] = useState(0); const [selected, setSelected] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [conversationLimit, setConversationLimit] = useState(20);
  const [discarded, setDiscarded] = useState<string[]>([]);
  const [localOutgoing, setLocalOutgoing] = useState<Record<string, InboxOutgoing>>({});
  const [syncing, setSyncing] = useState(false); const syncInFlight = useRef(false);
  const [refreshing, startRefresh] = useTransition(); const [notice, setNotice] = useState(""); const [gmailModal, setGmailModal] = useState(false);
  const replies = useMemo(() => {
    const merged = { ...localOutgoing };
    for (const row of outgoing) if (!merged[row.id] || (row.updatedAt ?? row.date) >= (merged[row.id].updatedAt ?? merged[row.id].date)) merged[row.id] = row;
    return Object.values(merged).filter(row => !discarded.includes(row.id)).sort((a,b) => b.date.localeCompare(a.date));
  }, [outgoing, localOutgoing, discarded]);
  const filtered = useMemo(() => filterInboxMessages(messages, { kind: filter, search, jobOnly: folder !== "all", oldestFirst: oldest }), [messages, filter, search, folder, oldest]);
  const outgoingFolder = folder === "sent" || folder === "drafts";
  const replyRows = replies.filter(row => (folder === "drafts" ? row.status === "draft" : row.status !== "draft") && `${row.subject} ${row.recipient} ${row.bodyText}`.toLowerCase().includes(search.toLowerCase()));
  const total = outgoingFolder ? replyRows.length : filtered.length;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(total / PAGE_SIZE) - 1));
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const visibleReplies = replyRows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const activeOutgoing = outgoingFolder ? replyRows.find(row => row.id === selected) ?? visibleReplies[0] : undefined;
  const current = outgoingFolder ? messages.find(message => message.id === activeOutgoing?.parentReplyId) ?? null : visible.find(message => message.id === selected) ?? visible[0] ?? null;
  const currentThread = current ? inboxThreadKey(current) : null;
  const thread = messages.filter(message => inboxThreadKey(message) === currentThread).sort((a,b) => a.date.localeCompare(b.date));
  const threadReplies = replies.filter(row => row.applicationId === current?.applicationId && row.status !== "draft" && current?.source === "application_reply");
  const conversation = [...thread.map(message => ({ date: message.date, message, reply: null as InboxOutgoing | null })), ...threadReplies.map(reply => ({ date: reply.date, message: null as InboxMessage | null, reply }))].sort((a,b) => a.date.localeCompare(b.date));
  const draft = activeOutgoing ?? replies.find(row => row.parentReplyId === current?.id && ["draft", "sending", "unknown"].includes(row.status));
  const folders: Array<{ id: Folder; label: string; icon: typeof Inbox; count: number }> = [
    { id: "inbox", label: tr("Inbox", "In arrivo"), icon: Inbox, count: messages.filter(message => message.jobRelated).length },
    { id: "sent", label: tr("Sent", "Inviate"), icon: Send, count: replies.filter(row => row.status !== "draft").length },
    { id: "drafts", label: tr("Drafts", "Bozze"), icon: FilePenLine, count: replies.filter(row => row.status === "draft").length },
    { id: "all", label: tr("All mail", "Tutte le email"), icon: Archive, count: messages.length },
  ];
  const chooseFolder = (value: Folder) => { setFolder(value); setPage(0); setSelected(null); setMobileOpen(false); setFilter("all"); };
  const updateAttention = async (id: string, action: "read" | "handled" | "reopen" | "tomorrow") => {
    if (attentionBusy) return; setAttentionBusy(true);
    try {
      const result = await fetch("/api/inbox/attention", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
      if (!result.ok) throw new Error();
      const { state: change } = await result.json();
      setAttentionState(old => ({ ...old, [id]: { ...old[id], ...change } }));
      setNotice(action === "tomorrow" ? tr("Reminder saved for tomorrow in LavorAI. No email will be sent.", "Promemoria salvato per domani in LavorAI. Nessuna email verrà inviata.") : tr("Attention status saved.", "Stato attività salvato."));
      startRefresh(() => router.refresh());
    } catch { setNotice(tr("Couldn't save attention status. Try again.", "Impossibile salvare lo stato. Riprova.")); }
    finally { setAttentionBusy(false); }
  };
  const selectMessage = (id: string) => { setSelected(id); setMobileOpen(true); setConversationLimit(20); if (messages.some(m => m.id === id)) void updateAttention(id, "read"); };
  const deepLink = searchParams.get("message");
  const openedDeepLink = useRef<string | null>(null);
  useEffect(() => {
    if (!deepLink) { openedDeepLink.current = null; return; }
    if (openedDeepLink.current === deepLink) return;
    const index = initialMessages.filter(m => m.jobRelated).findIndex(m => m.id === deepLink);
    if (index >= 0) { openedDeepLink.current = deepLink; setFolder("inbox"); setPage(Math.floor(index / PAGE_SIZE)); setSelected(deepLink); setMobileOpen(true); }
  }, [deepLink, initialMessages]);
  useEffect(() => {
    const refreshVisible = () => { if (!document.hidden) startRefresh(() => router.refresh()); };
    const timer = window.setInterval(refreshVisible, 60000); window.addEventListener("focus", refreshVisible);
    return () => { clearInterval(timer); window.removeEventListener("focus", refreshVisible); };
  }, [router]);
  useEffect(() => {
    const value = searchParams.get("gmail"); if (!value) return;
    setNotice(value === "linked" ? tr("Gmail connected. Sync to load your messages.", "Gmail collegato. Sincronizza per caricare i messaggi.") : tr("Couldn't connect Gmail. Try again using your LavorAI account's email.", "Impossibile collegare Gmail. Riprova con l'email del tuo account LavorAI."));
    const url = new URL(window.location.href); url.searchParams.delete("gmail"); url.searchParams.delete("reason"); window.history.replaceState({}, "", url.toString());
  }, [searchParams, userEmail]);
  const sync = async () => {
    if (syncInFlight.current || !gmailConnected) return; syncInFlight.current = true; setSyncing(true);
    try { const response = await fetch("/api/gmail/sync", { method: "POST" }); if (!response.ok) throw new Error(); setNotice(tr("Gmail messages updated.", "Messaggi Gmail aggiornati.")); startRefresh(() => router.refresh()); }
    catch { setNotice(tr("Couldn't sync Gmail. Please try again.", "Sincronizzazione Gmail non riuscita. Riprova.")); }
    finally { syncInFlight.current = false; setSyncing(false); }
  };
  return <div className={`mail-workspace${mobileOpen ? " mail-reading" : ""}`}>
    <GmailConnectModal open={gmailModal} onClose={() => setGmailModal(false)} />
    {notice && <div role="status" className="mail-global-notice">{notice}<button type="button" className="mail-icon" aria-label={tr("Dismiss notice", "Chiudi avviso")} onClick={() => setNotice("")}><X size={15} /></button></div>}
    <div className="mail-layout">
      <section className="mail-list-pane" aria-label={tr("Message list", "Elenco messaggi")}>
        <div className="mail-list-heading"><h1>{tr("Messages", "Messaggi")}</h1><span className="mail-count" title={tr("Unread in this recent selection", "Non letti in questa selezione recente")}>{messages.filter(m => m.read === false).length} {tr("unread", "non letti")}</span><button type="button" className="mail-icon" aria-label={tr("Refresh inbox", "Aggiorna inbox")} title={tr("Refresh inbox", "Aggiorna inbox")} disabled={refreshing} onClick={() => startRefresh(() => router.refresh())}><RefreshCw size={15} className={refreshing ? "mail-spin" : ""} /></button></div>
        <label className="mail-search"><Search size={16} /><input aria-label={tr("Search inbox", "Cerca nella inbox")} placeholder={tr("Search recruiter or company…", "Cerca recruiter o azienda…")} value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} />{search && <button type="button" className="mail-icon" aria-label={tr("Clear search", "Cancella ricerca")} onClick={() => setSearch("")}><X size={15} /></button>}</label>
        <nav className="mail-folders" aria-label={tr("Mail folders", "Cartelle email")}>
          {folders.map(item => <button key={item.id} type="button" title={item.label} aria-label={item.label} aria-current={folder === item.id ? "page" : undefined} onClick={() => chooseFolder(item.id)}><item.icon size={13} /><span>{item.label}</span>{item.id === "drafts" && item.count > 0 && <small>{item.count}</small>}</button>)}
        </nav>
        {!outgoingFolder && <div className="mail-filters" aria-label={tr("Message categories", "Categorie messaggi")}>{([["all", tr("All", "Tutte")], ["colloquio", tr("Interviews", "Colloqui")], ["risposta", tr("Replies", "Risposte")], ["bounce", tr("Failed", "Errori")]] as Array<[InboxFilter,string]>).map(([value,label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(0); }}>{label}</button>)}</div>}
        <div className="mail-message-list" aria-label={tr("Messages", "Messaggi")}>
          {!total && <div className="mail-empty"><Inbox size={30} /><strong>{search ? tr("No matching messages", "Nessun messaggio trovato") : folder === "drafts" ? tr("No saved drafts", "Nessuna bozza salvata") : folder === "sent" ? tr("No replies sent yet", "Nessuna risposta inviata") : tr("You're all caught up", "Nessun messaggio in arrivo")}</strong><p>{search ? tr("Try a company, sender or subject.", "Cerca un'azienda, un mittente o un oggetto.") : tr("Replies to your applications will appear here.", "Le risposte alle tue candidature compariranno qui.")}</p></div>}
          {!outgoingFolder ? visible.map(message => <button type="button" className="mail-row" key={message.id} aria-pressed={current?.id === message.id} onClick={() => selectMessage(message.id)}>
            <span className="mail-avatar" aria-hidden="true">{(message.company || senderName(message.from)).slice(0,2).toUpperCase()}</span>
            <span className="mail-row-content"><span className="mail-row-top"><strong>{senderName(message.from)}</strong><time>{fmtDate(message.date,en)}</time></span><span className="mail-subject">{message.subject || tr("(no subject)", "(senza oggetto)")}</span><span className="mail-preview">{message.snippet}</span><span className="mail-row-bottom">{message.company || (message.source === "gmail" ? "Gmail" : "LavorAI")}{message.kind === "colloquio" && <span className="mail-label">{tr("Possible interview", "Possibile colloquio")}</span>}</span></span>
          </button>) : visibleReplies.map(row => <button type="button" className="mail-row" key={row.id} aria-pressed={row.id === activeOutgoing?.id} onClick={() => selectMessage(row.id)}><span className="mail-avatar"><Send size={15} /></span><span className="mail-row-content"><span className="mail-row-top"><strong>{row.recipient}</strong><time>{fmtDate(row.date,en)}</time></span><span className="mail-subject">{row.subject}</span><span className="mail-preview">{row.bodyText}</span><span className="mail-row-bottom">{statusText(row.status,en)}</span></span></button>)}
        </div>
        <footer className="mail-pagination"><button type="button" className="mail-icon" aria-label={oldest ? tr("Show newest first", "Mostra prima le più recenti") : tr("Show oldest first", "Mostra prima le meno recenti")} onClick={() => { setOldest(!oldest); setPage(0); }}><ArrowDownWideNarrow size={14} /></button><span>{total ? `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE,total)} / ${total}` : "0"}</span><button type="button" className="mail-icon" aria-label={tr("Previous page", "Pagina precedente")} disabled={!currentPage} onClick={() => { setPage(currentPage-1); setSelected(null); }}><ChevronLeft size={17} /></button><button type="button" className="mail-icon" aria-label={tr("Next page", "Pagina successiva")} disabled={(currentPage+1)*PAGE_SIZE >= total} onClick={() => { setPage(currentPage+1); setSelected(null); }}><ChevronRight size={17} /></button></footer>
        <button type="button" className="mail-mobile-sync" disabled={syncing} onClick={gmailConnected ? sync : () => setGmailModal(true)}>{gmailConnected ? tr("Sync Gmail", "Sincronizza Gmail") : tr("Connect Gmail", "Collega Gmail")}<RefreshCw size={13} /></button>
      </section>
      <section className="mail-reader" aria-label={tr("Message details", "Dettagli messaggio")}>
        {!current ? <div className="mail-empty mail-reader-empty"><Mail size={36} /><strong>{tr("A little closer to your next role", "Un passo verso il prossimo lavoro")}</strong><p>{activeOutgoing ? tr("The original message is outside the recent inbox window. Your saved reply is shown below.", "Il messaggio originale non è tra quelli recenti. La risposta salvata è riportata sotto.") : tr("Select an email to read the conversation.", "Seleziona un'email per leggere la conversazione.")}</p>{activeOutgoing && <><h3>{activeOutgoing.subject}</h3><p className="mail-body">{activeOutgoing.bodyText}</p><small>{statusText(activeOutgoing.status,en)}</small></>}</div> : <>
          <header className="mail-reader-heading"><div className="mail-reader-actions"><button type="button" className="mail-icon mail-back" aria-label={tr("Back to messages", "Torna ai messaggi")} onClick={() => setMobileOpen(false)}><ArrowLeft size={18} /></button><span className="mail-avatar">{senderName(current.from).slice(0,2).toUpperCase()}</span><div className="mail-contact"><strong>{senderName(current.from)}</strong><span>{current.company || (current.source === "gmail" ? "Gmail" : "LavorAI")}<span className="mail-contact-role"> · {current.jobTitle || tr("Application correspondence", "Corrispondenza candidature")}</span></span></div>
            {current.applicationId && <Link className="mail-application" title={tr("View application", "Vedi candidatura")} href={`/applications?id=${encodeURIComponent(current.applicationId)}`}><BriefcaseBusiness size={14} /><span>{tr("Application", "Candidatura")}</span></Link>}
            </div>
          </header>
          <div className="mail-attention-controls">
            <span>{current.read === null ? tr("Historical read state unknown", "Lettura storica sconosciuta") : current.read ? tr("Read in LavorAI", "Letto in LavorAI") : tr("Unread", "Non letto")}</span>
            {current.read !== true && <button type="button" disabled={attentionBusy} onClick={() => updateAttention(current.id, "read")}>{tr("Mark read", "Segna come letto")}</button>}
            <button type="button" disabled={attentionBusy} onClick={() => updateAttention(current.id, current.handledAt || current.remindAt ? "reopen" : "handled")}>{current.handledAt || current.remindAt ? tr("Reopen attention", "Riapri attività") : tr("Mark handled", "Segna gestito")}</button>
            {!current.handledAt && <button type="button" disabled={attentionBusy} onClick={() => updateAttention(current.id, "tomorrow")}>{tr("Remind tomorrow", "Ricorda domani")}</button>}
            {current.remindAt && <small>{tr("In-app reminder:", "Promemoria in app:")} {new Date(current.remindAt).toLocaleString(locale)}</small>}
            {current.handledAt && <small>{tr("Marked handled by you; this is not a send receipt.", "Segnato gestito da te; non è una ricevuta di invio.")}</small>}
          </div>
          <div className="mail-conversation"><div className="mail-thread-subject">{current.subject || tr("(no subject)", "(senza oggetto)")}</div>
            {conversation.length > conversationLimit && <button type="button" className="mail-text-button" onClick={() => setConversationLimit(value => value + 20)}>{tr("Show earlier messages", "Mostra messaggi precedenti")} ({conversation.length - conversationLimit})</button>}
            {conversation.slice(-conversationLimit).map(item => <article className={`mail-letter${item.reply ? " mail-letter-outgoing" : ""}`} key={item.reply?.id ?? item.message!.id}>
              <header><span className="mail-avatar" aria-hidden="true">{item.reply ? <Send size={16} /> : senderName(item.message!.from).slice(0,2).toUpperCase()}</span><div><strong>{item.reply ? tr("You", "Tu") : senderName(item.message!.from)}</strong><small>{item.reply ? `${tr("To", "A")} ${item.reply.recipient}` : item.message!.from}</small></div><time>{fmtDate(item.date,en,true)}</time></header>
              {item.reply && <div className="mail-delivery">{statusText(item.reply.status,en)}</div>}
              <div className="mail-body" data-testid="message-body">{item.reply?.bodyText ?? item.message?.bodyText ?? item.message?.snippet ?? tr("No content", "Nessun contenuto")}</div>
              {item.reply?.failureCode && <p className="mail-notice">{errorText(item.reply.failureCode,en)}</p>}
            </article>)}
          </div>
          {current.source === "application_reply" && <div className="mail-compose-dock"><ReplyComposer key={`${current.id}:${activeOutgoing?.id ?? "reply"}`} message={current} ownerId={ownerId} en={en} initial={draft} onDiscarded={id => { setDiscarded(previous => [...previous,id]); startRefresh(() => router.refresh()); }} onSaved={row => { setLocalOutgoing(previous => ({ ...previous, [row.id]: row })); startRefresh(() => router.refresh()); }} /></div>}
          {current.source === "gmail" && <footer className="mail-reader-footer">{current.gmailMessageId && <a className="mail-reply-button" href={`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(userEmail ?? "")}#all/${encodeURIComponent(current.gmailMessageId)}`} target="_blank" rel="noopener noreferrer"><Reply size={17} />{tr("Reply in Gmail", "Rispondi in Gmail")}</a>}<span>{tr("Gmail is read-only here. Reading this copy does not mark the original as read.", "Gmail è in sola lettura qui. Aprire questa copia non segna l'originale come letto.")}</span></footer>}

        </>}
      </section>
      <aside className="mail-context" aria-label={tr("Application context", "Contesto candidatura")}>
        <div className="mail-context-title">{tr("Application details", "Dettagli candidatura")}</div>
        {current?.applicationId ? <section className="mail-context-card"><div className="mail-company"><span className="mail-avatar">{current.company?.slice(0,2).toUpperCase()}</span><div><strong>{current.company}</strong><small>{current.location || tr("Location not specified", "Località non indicata")}</small></div></div><h3>{current.jobTitle}</h3><div className="mail-facts"><div><small>{tr("Salary", "Retribuzione")}</small><strong>{current.salaryMin ? `€${current.salaryMin.toLocaleString(locale)}${current.salaryMax ? ` – €${current.salaryMax.toLocaleString(locale)}` : "+"}` : tr("Not listed", "Non indicata")}</strong></div><div><small>{tr("Work setup", "Modalità")}</small><strong>{current.remote ? tr("Remote", "Da remoto") : tr("See job listing", "Vedi annuncio")}</strong></div></div><Link className="mail-context-link" href={`/applications?id=${encodeURIComponent(current.applicationId)}`}>{tr("View application", "Vedi candidatura")} <ChevronRight size={14} /></Link></section> : <section className="mail-context-card"><p>{tr("Select a message linked to an application to see its details.", "Seleziona un messaggio collegato a una candidatura per vederne i dettagli.")}</p></section>}
        {current && <section className="mail-context-card"><h3 className="mail-context-accent"><Mail size={15} />{tr("This conversation", "Questa conversazione")}</h3><dl><div><dt>{tr("Source", "Fonte")}</dt><dd>{current.source === "gmail" ? "Gmail" : "LavorAI"}</dd></div><div><dt>{tr("Messages", "Messaggi")}</dt><dd>{conversation.length}</dd></div><div><dt>{tr("Last received", "Ultima ricevuta")}</dt><dd>{fmtDate(current.date,en)}</dd></div></dl><p>{tr("Message labels are estimates, not confirmation of an interview or an offer.", "Le categorie sono stime: non confermano un colloquio o un'offerta.")}</p></section>}
        <section className="mail-context-card"><h3 className="mail-context-cyan">{tr("KEEP THE CONVERSATION GOING", "CONTINUA LA CONVERSAZIONE")}</h3><p>{tr("Reply with your availability or ask about the role. Only messages you choose to send leave your inbox.", "Rispondi con le tue disponibilità o chiedi informazioni sul ruolo. Partono solo i messaggi che scegli di inviare.")}</p><p>{tr("Sent means accepted by the email service. Delivery is confirmed separately.", "Inviata significa accettata dal servizio email. La consegna viene confermata separatamente.")}</p></section>
        <div className="mail-gmail-connection"><span className="mail-connected-dot" />{gmailConnected ? tr("Gmail connected", "Gmail collegato") : tr("Gmail optional", "Gmail facoltativo")}<button type="button" className="mail-context-link" disabled={syncing} onClick={gmailConnected ? sync : () => setGmailModal(true)}>{gmailConnected ? syncing ? tr("Syncing…", "Sincronizzazione…") : tr("Sync Gmail", "Sincronizza Gmail") : tr("Connect Gmail", "Collega Gmail")}<RefreshCw size={13} /></button></div>
      </aside>
    </div>
    <div className="mail-footnote"><CircleAlert size={12} />{tr("200 recent messages per source, plus saved reply threads. Labels are estimates. Security codes are hidden.", "200 messaggi recenti per fonte e conversazioni con risposte salvate. Categorie stimate. Codici di sicurezza nascosti.")}</div>
  </div>;
}
