"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/design/icon";
import { CompanyLogo, companyColor } from "@/components/design/company-logo";
import Link from "next/link";
import { GmailConnectModal } from "@/components/gmail-connect-modal";
import { toast } from "sonner";
export interface GmailInboxMessage {
id: string;
from: string;
subject: string | null;
snippet: string | null;
bodyText: string | null;
date: string;
kind: string;
label: string | null;
read: boolean;
applicationId: string | null;
company?: string | null;
jobTitle?: string | null;
}
interface InboxViewProps {
messages: GmailInboxMessage[];
gmailConnected: boolean;
userEmail: string | null;
interviewCount: number;
}
type StatusOption = "not-this-time" | "interested" | "applied" | "interviewing" | null;
type Filter = "inbox" | "unread" | "interviews" | "rejections" | "confirmations" | "other";
const fmtDay = (iso: string) => {
const d = new Date(iso);
const now = new Date();
const sameDay = d.toDateString() === now.toDateString();
return sameDay
? d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
: d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
};
const fmtFull = (iso: string) =>
new Date(iso).toLocaleString("en-US", {
day: "numeric",
month: "long",
year: "numeric",
hour: "2-digit",
minute: "2-digit",
hour12: false,
});
export function GmailInboxView({ messages, gmailConnected, userEmail, interviewCount }: InboxViewProps) {
const router = useRouter();
const searchParams = useSearchParams();
const [filter, setFilter] = useState<Filter>("inbox");
const [search, setSearch] = useState("");
const [selected, setSelected] = useState<string | null>(messages[0]?.id ?? null);
const [syncing, setSyncing] = useState(false);
const [syncNotice, setSyncNotice] = useState<string | null>(null);
const [showGmailModal, setShowGmailModal] = useState(false);
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [currentStatus, setCurrentStatus] = useState<StatusOption>(null);
const [inboxFilter, setInboxFilter] = useState<"inbox" | "all">("inbox");
const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
const filtered = messages
.filter((m) => {
if (inboxFilter === "inbox") {
const fromLower = m.from.toLowerCase();
const isNoise =
m.kind === "auto" &&
!m.applicationId &&
(fromLower.includes("jobalerts") ||
fromLower.includes("linkedin") ||
m.label === "Auto-reply");
if (isNoise) return false;
}
if (filter === "unread" && m.read) return false;
if (filter === "interviews" && m.kind !== "colloquio") return false;
if (filter === "rejections" && m.kind !== "rifiutata") return false;
if (filter === "confirmations" && m.kind !== "ricevuta") return false;
if (filter === "other" && !["colloquio", "rifiutata", "ricevuta"].includes(m.kind)) return false;
if (search) {
const needle = search.toLowerCase();
const haystack = `${m.from} ${m.subject} ${m.snippet}`.toLowerCase();
if (!haystack.includes(needle)) return false;
}
return true;
})
.sort((a, b) => {
const aTime = new Date(a.date).getTime();
const bTime = new Date(b.date).getTime();
return sortOrder === "newest" ? bTime - aTime : aTime - bTime;
});
const current = filtered.find((m) => m.id === selected) ?? null;
useEffect(() => {
if (!current && filtered.length > 0) {
setSelected(filtered[0].id);
}
}, [filter, search, filtered, current]);
const handleRefresh = async () => {
setSyncing(true);
setSyncNotice(null);
try {
const res = await fetch("/api/gmail/sync", { method: "POST" });
const data = await res.json();
if (res.ok) {
setSyncNotice(`Sincronizzati ${data.synced} nuovi messaggi`);
router.refresh();
} else {
setSyncNotice(data.error || "Sync fallita");
}
} catch (err) {
setSyncNotice("Errore di rete");
} finally {
setSyncing(false);
}
};
const handleMarkAllRead = async () => {
// TODO: implement mark all read endpoint
router.refresh();
};
const toggleSelectAll = () => {
if (selectedIds.size === filtered.length && filtered.length > 0) {
setSelectedIds(new Set());
} else {
setSelectedIds(new Set(filtered.map((m) => m.id)));
}
};
const toggleSelect = (id: string) => {
const newSet = new Set(selectedIds);
if (newSet.has(id)) {
newSet.delete(id);
} else {
newSet.add(id);
}
setSelectedIds(newSet);
};
const handleStatusChange = async (status: StatusOption) => {
if (!current?.applicationId) return;
const previous = currentStatus;
setCurrentStatus(status);
const mapped =
status === "interested"
? "risposta"
: status === "applied"
? "vista"
: status === "interviewing"
? "colloquio"
: "rifiutata";
try {
const res = await fetch(`/api/applications/${current.applicationId}/status`, {
method: "PUT",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ status: mapped }),
});
if (!res.ok) {
const data = await res.json().catch(() => ({} as { error?: string }));
setCurrentStatus(previous);
toast.error(data.error || "Impossibile aggiornare lo stato");
return;
}
toast.success("Stato aggiornato");
} catch {
setCurrentStatus(previous);
toast.error("Errore di rete");
}
};
useEffect(() => {
const gmailParam = searchParams.get("gmail");
const reasonParam = searchParams.get("reason");
if (gmailParam === "linked") {
setSyncNotice("Gmail collegato con successo! Le risposte dei recruiter appariranno qui.");
const url = new URL(window.location.href);
url.searchParams.delete("gmail");
window.history.replaceState({}, "", url.toString());
router.refresh();
} else if (gmailParam === "error") {
const errorMessages: Record<string, string> = {
denied: "Collegamento annullato. Devi autorizzare l'accesso a Gmail per vedere le risposte dei recruiter.",
email_mismatch: `L'email Google non corrisponde all'account LavorAI (${userEmail}). Usa lo stesso indirizzo email.`,
account_already_linked: "Questo account Google è già collegato a un altro utente LavorAI.",
state_expired: "Sessione scaduta. Riprova a collegare Gmail.",
invalid_state: "Errore di sicurezza. Riprova a collegare Gmail.",
token_exchange: "Errore durante lo scambio dei token con Google. Riprova.",
userinfo_fetch: "Impossibile recuperare i dati del tuo account Google. Riprova.",
server_config: "Errore di configurazione del server. Contatta il supporto.",
db_error: "Errore durante il salvataggio. Riprova tra qualche minuto.",
oauth_error: "Errore OAuth. Riprova a collegare Gmail.",
missing_params: "Parametri OAuth mancanti. Riprova.",
no_access_token: "Token di accesso non ricevuto da Google. Riprova.",
userinfo_missing: "Email non trovata nell'account Google. Riprova.",
user_not_found: "Utente non trovato. Effettua nuovamente il login.",
};
const message = reasonParam && errorMessages[reasonParam]
? errorMessages[reasonParam]
: "Errore durante il collegamento di Gmail. Riprova.";
setSyncNotice(message);
const url = new URL(window.location.href);
url.searchParams.delete("gmail");
url.searchParams.delete("reason");
window.history.replaceState({}, "", url.toString());
}
}, [searchParams, router, userEmail]);
const labelCls = (kind: string) => {
switch (kind) {
case "colloquio":
return "ds-chip-green";
case "rifiutata":
return "ds-chip-red";
case "ricevuta":
return "ds-chip-blue";
case "risposta":
return "ds-chip-purple";
default:
return "";
}
};

if (!gmailConnected) {
return (
<>
<GmailConnectModal open={showGmailModal} onClose={() => setShowGmailModal(false)} />
<div className="fit-page" style={{ placeItems: "center" }}>
<div className="fit-card" style={{ maxWidth: 480, textAlign: "center", padding: 40, display: "grid", gap: 16 }}>
<div style={{ fontSize: 48 }}>📧</div>
<h2 style={{ fontSize: 22, fontWeight: 600 }}>Collega Gmail</h2>
<p style={{ fontSize: 14, color: "var(--fg-muted)" }}>Connetti Gmail per vedere le risposte dei recruiter.</p>
<button type="button" onClick={() => setShowGmailModal(true)} className="ds-btn ds-btn-primary">
<Icon name="inbox" size={14} /> Collega Gmail
</button>
</div>
</div>
</>
);
}
return (
<div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gridTemplateRows: "auto auto 1fr", height: "100%" }}>
<div style={{ gridColumn: "1 / -1", padding: 16, borderBottom: "1px solid var(--border-ds)", display: "flex", gap: 12, alignItems: "center" }}>
<h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Inbox</h1>
{userEmail && <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{userEmail}</span>}
{interviewCount > 0 && (
<button type="button" onClick={() => setFilter("interviews")} className="ds-btn">
{interviewCount} interview{interviewCount === 1 ? "" : "s"}
</button>
)}
</div>
<div style={{ gridColumn: "1 / -1", padding: 12, borderBottom: "1px solid var(--border-ds)", display: "flex", flexWrap: "wrap", gap: 8 }}>
<select value={inboxFilter} onChange={(e) => setInboxFilter(e.target.value as "inbox" | "all")}>
<option value="inbox">Inbox</option>
<option value="all">All Mail</option>
</select>
<select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
<option value="inbox">All Labels</option>
<option value="interviews">Interviews</option>
<option value="confirmations">Confirmations</option>
<option value="rejections">Rejections</option>
<option value="other">Other</option>
</select>
<select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}>
<option value="newest">Newest</option>
<option value="oldest">Oldest</option>
</select>
<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." />
<button type="button" onClick={handleRefresh} disabled={syncing}>Refresh</button>
{syncNotice && <span style={{ fontSize: 12 }}>{syncNotice}</span>}
</div>
<div style={{ overflowY: "auto", borderRight: "1px solid var(--border-ds)" }}>
{filtered.length === 0 ? (
<div style={{ padding: 24, color: "var(--fg-muted)" }}>No messages</div>
) : filtered.map((msg) => (
<div key={msg.id} onClick={() => setSelected(msg.id)} style={{ padding: 12, borderBottom: "1px solid var(--border-ds)", background: msg.id === selected ? "var(--bg-sunken)" : undefined, cursor: "pointer" }}>
<div style={{ fontWeight: msg.read ? 500 : 700 }}>{msg.from.split("<")[0].trim() || msg.from}</div>
<div>{msg.subject || "(no subject)"}</div>
<div style={{ fontSize: 12, color: "var(--fg-muted)" }}>{msg.snippet}</div>
<span style={{ fontSize: 11 }}>{fmtDay(msg.date)}</span>
</div>
))}
</div>
<div style={{ display: "flex", flexDirection: "column" }}>
{!current ? (
<div style={{ margin: "auto", color: "var(--fg-muted)" }}>Select a message</div>
) : (
<>
<div style={{ padding: 20, borderBottom: "1px solid var(--border-ds)" }}>
<h2 style={{ fontSize: 18, fontWeight: 600 }}>{current.subject || "(no subject)"}</h2>
<div style={{ fontSize: 13, margin: "8px 0 16px" }}>{current.from} · {fmtFull(current.date)}</div>
<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
{current.applicationId && (
<Link href={`/applications?id=${current.applicationId}`} className="ds-btn ds-btn-primary">View Application</Link>
)}
<select
value={currentStatus || ""}
onChange={(e) => handleStatusChange((e.target.value || null) as StatusOption)}
disabled={!current.applicationId}
>
<option value="">Not this time</option>
<option value="interested">Interested</option>
<option value="applied">Applied</option>
<option value="interviewing">Interviewing</option>
</select>
<button type="button" disabled title="Coming soon" style={{ opacity: 0.5, cursor: "not-allowed" }}>Reply</button>
<button type="button" disabled title="Coming soon" style={{ opacity: 0.5, cursor: "not-allowed" }}>Forward</button>
<button type="button" disabled title="Coming soon" style={{ opacity: 0.5, cursor: "not-allowed" }}>Delete</button>
</div>
</div>
<div style={{ flex: 1, overflowY: "auto", padding: 20, whiteSpace: "pre-wrap" }}>
{current.company && (
<div style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
<CompanyLogo company={current.company} color={companyColor(current.company)} size={40} url="" />
<div>
<div style={{ fontWeight: 600 }}>{current.company}</div>
<div style={{ fontSize: 13, color: "var(--fg-muted)" }}>{current.jobTitle || "Related application"}</div>
</div>
</div>
)}
{current.bodyText || current.snippet || "No content"}
</div>
</>
)}
</div>
</div>
);
}
