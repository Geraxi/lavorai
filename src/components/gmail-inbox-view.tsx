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
}
type ManualStatus = "inviata" | "vista" | "colloquio" | "offerta" | "rifiutata";
const statusOptions: Array<[ManualStatus, string]> = [
  ["inviata", "Applied"], ["vista", "Viewed"], ["colloquio", "Interviewing"],
  ["offerta", "Offer"], ["rifiutata", "Not this time"],
];
const fmtDate = (iso: string) => new Date(iso).toLocaleString("en-GB", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC",
}) + " UTC";

export function GmailInboxView({ messages, gmailConnected, userEmail }: InboxViewProps) {
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
      setSyncNotice(response.ok ? `Gmail sync complete: ${data.synced ?? 0} new messages.` : data.error || "Gmail sync failed.");
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
        toast.error("Couldn't update the application status.");
        return;
      }
      // Key by application, so a late request cannot change another message's status.
      setSavedStatuses((previous) => ({ ...previous, [applicationId]: status }));
      toast.success("Application status updated.");
    } catch {
      toast.error("Network error. Try again.");
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <GmailConnectModal open={showGmailModal} onClose={() => setShowGmailModal(false)} />
      <div style={{ padding: 16, borderBottom: "1px solid var(--border-ds)", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Inbox</h1>
        {userEmail && <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{userEmail}</span>}
        {interviewCount > 0 && <button type="button" onClick={() => setFilter("colloquio")} className="ds-btn">{interviewCount} possible interview{interviewCount === 1 ? "" : "s"}</button>}
        <button type="button" onClick={handleRefresh} disabled={refreshing} className="ds-btn">{refreshing ? "Refreshing…" : "Refresh inbox"}</button>
        {gmailConnected ? (
          <button type="button" onClick={handleSyncGmail} disabled={syncing} className="ds-btn">{syncing ? "Syncing Gmail…" : "Sync Gmail"}</button>
        ) : (
          <button type="button" onClick={() => setShowGmailModal(true)} className="ds-btn"><Icon name="inbox" size={14} /> Connect Gmail (optional)</button>
        )}
      </div>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-ds)", fontSize: 12, color: "var(--fg-muted)" }}>
        Replies sent to your LavorAI application address appear here without Gmail. Previously synced Gmail messages are also kept here.
        <div>Labels are automatic estimates. An interview or reply label does not verify who wrote the message.</div>
        {syncNotice && <div role="status" style={{ marginTop: 6 }}>{syncNotice}</div>}
      </div>
      <div style={{ padding: 12, borderBottom: "1px solid var(--border-ds)", display: "flex", flexWrap: "wrap", gap: 8 }}>
        <select aria-label="Mailbox" value={inboxFilter} onChange={(event) => setInboxFilter(event.target.value as "inbox" | "all")}>
          <option value="inbox">Application mail</option><option value="all">All saved mail</option>
        </select>
        <select aria-label="Message type" value={filter} onChange={(event) => setFilter(event.target.value as InboxFilter)}>
          <option value="all">All labels</option><option value="colloquio">Possible interviews</option>
          <option value="risposta">Possible recruiter replies</option><option value="ricevuta">Application receipts</option>
          <option value="rifiutata">Possible rejections</option><option value="bounce">Delivery failures</option>
          <option value="auto">Automated messages</option>
        </select>
        <select aria-label="Sort messages" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as "newest" | "oldest")}>
          <option value="newest">Newest</option><option value="oldest">Oldest</option>
        </select>
        <input aria-label="Search inbox" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search messages…" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[340px_minmax(0,1fr)]" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <div className="max-h-[36vh] md:max-h-none" style={{ overflowY: "auto", borderRight: "1px solid var(--border-ds)" }} aria-label="Messages">
          {filtered.length === 0 ? (
            <div style={{ padding: 24, color: "var(--fg-muted)" }}>
              {messages.length ? "No messages match your filters." : "No replies yet. Messages received by LavorAI will appear here. You can also connect Gmail to import application emails sent to your personal address."}
            </div>
          ) : filtered.map((message) => (
            <button key={message.id} type="button" onClick={() => setSelected(message.id)} aria-pressed={message.id === current?.id}
              style={{ display: "block", width: "100%", textAlign: "left", padding: 12, borderBottom: "1px solid var(--border-ds)", background: message.id === current?.id ? "var(--bg-sunken)" : "transparent", cursor: "pointer", overflowWrap: "anywhere" }}>
              <div style={{ fontWeight: message.read === false ? 700 : 500 }}>{message.from.split("<")[0].trim() || message.from}</div>
              <div>{message.subject || "(no subject)"}</div>
              <div style={{ fontSize: 12, color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{message.snippet}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, fontSize: 11 }}>
                <span className="ds-chip">{inboxSourceLabel(message.source)}</span><span className="ds-chip">{message.label}</span><span>{fmtDate(message.date)}</span>
              </div>
            </button>
          ))}
          {messages.length > 0 && <p style={{ padding: 12, fontSize: 11, color: "var(--fg-muted)" }}>Up to 200 recent messages per source. Security-code messages are hidden.</p>}
        </div>
        <section aria-label="Message details" style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 180, overflowY: "auto" }}>
          {!current ? <div style={{ margin: "auto", padding: 24, color: "var(--fg-muted)" }}>Select a message</div> : (
            <>
              <div style={{ padding: 20, borderBottom: "1px solid var(--border-ds)", overflowWrap: "anywhere" }}>
                <h2 style={{ fontSize: 18, fontWeight: 600 }}>{current.subject || "(no subject)"}</h2>
                <div style={{ fontSize: 13, margin: "8px 0" }}>{current.from} · {fmtDate(current.date)}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  <span className="ds-chip">{inboxSourceLabel(current.source)}</span><span className="ds-chip">{current.label}</span>
                </div>
                {current.applicationId && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <Link href={`/applications?id=${encodeURIComponent(current.applicationId)}`} className="ds-btn ds-btn-primary">View application</Link>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      Manual application status
                      <select aria-label="Manual application status" value={statusOptions.some(([value]) => value === currentStatus) ? currentStatus : ""} disabled={savingStatus}
                        onChange={(event) => handleStatusChange(event.target.value as ManualStatus)}>
                        <option value="" disabled>Set status…</option>
                        {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                  </div>
                )}
                <div style={{ marginTop: 12, fontSize: 12, color: "var(--fg-muted)" }}>
                  {current.source === "application_reply"
                    ? "Received directly by LavorAI. Read and archive state are not tracked for these messages."
                    : "Saved from Gmail. Opening this copy does not mark it read or change your Gmail mailbox."}
                  {" "}Sending replies from this inbox is not available.
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0, padding: 20, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {current.company && (
                  <div style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
                    <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 40, height: 40, flexShrink: 0, borderRadius: 6, color: "white", background: companyColor(current.company), fontWeight: 600 }}>{current.company.slice(0, 2)}</span>
                    <div><div style={{ fontWeight: 600 }}>{current.company}</div><div style={{ fontSize: 13, color: "var(--fg-muted)" }}>{current.jobTitle || "Related application"}</div></div>
                  </div>
                )}
                <div data-testid="message-body">{current.bodyText || current.snippet || "No content"}</div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
