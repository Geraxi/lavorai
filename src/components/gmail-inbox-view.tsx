"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/design/icon";
import { CompanyLogo, companyColor } from "@/components/design/company-logo";
import Link from "next/link";
import { GmailConnectModal } from "@/components/gmail-connect-modal";

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

/**
 * Gmail-style inbox view matching AIApply screenshot.
 * Three-pane layout: list, detail, with toolbar and filters.
 */
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
    setCurrentStatus(status);
    // TODO: implement status update API
    // await fetch(`/api/applications/${current.applicationId}/status`, {
    //   method: 'PATCH',
    //   body: JSON.stringify({ userStatus: status })
    // });
  };

  // Detect OAuth return and show success/error message
  useEffect(() => {
    const gmailParam = searchParams.get("gmail");
    const reasonParam = searchParams.get("reason");
    
    if (gmailParam === "linked") {
      setSyncNotice("Gmail collegato con successo! Le risposte dei recruiter appariranno qui.");
      // Remove params from URL
      const url = new URL(window.location.href);
      url.searchParams.delete("gmail");
      window.history.replaceState({}, "", url.toString());
      router.refresh();
    } else if (gmailParam === "error") {
      // Map error reasons to user-friendly messages
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
      
      // Remove params from URL
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

  // Empty state: Gmail not connected
  if (!gmailConnected) {
    return (
      <>
        <GmailConnectModal open={showGmailModal} onClose={() => setShowGmailModal(false)} />
        <div className="fit-page" style={{ placeItems: "center" }}>
          <div
            className="fit-card"
            style={{
              maxWidth: 480,
              textAlign: "center",
              padding: 40,
              display: "grid",
              gap: 20,
            }}
          >
            <div style={{ fontSize: 48 }}>📧</div>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 10 }}>
                Collega Gmail
              </h2>
              <p style={{ fontSize: 14, color: "var(--fg-muted)", lineHeight: 1.6 }}>
                Connetti il tuo account Gmail per vedere le risposte dei recruiter
                direttamente qui, classificate automaticamente (colloqui, rifiuti,
                conferme).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowGmailModal(true)}
              className="ds-btn ds-btn-primary"
              style={{ width: "100%" }}
            >
              <Icon name="inbox" size={14} />
              Collega Gmail
            </button>
            <p style={{ fontSize: 12, color: "var(--fg-subtle)" }}>
              Le tue email non vengono mai inviate o modificate. Accesso in sola
              lettura.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(320px, 380px) minmax(0, 1fr)",
        gridTemplateRows: "auto auto minmax(0, 1fr)",
        height: "100%",
        background: "var(--bg)",
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          gridColumn: "1 / -1",
          padding: "16px 24px",
          borderBottom: "1px solid var(--border-ds)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          background: "var(--bg)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Inbox</h1>
          {userEmail && (
            <div
              style={{
                fontSize: 13,
                color: "var(--fg-muted)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                border: "1px solid var(--border-ds)",
                borderRadius: 8,
                background: "var(--bg-elev)",
              }}
            >
              <Icon name="mail" size={14} />
              {userEmail}
            </div>
          )}
        </div>
        {interviewCount > 0 && (
          <button
            type="button"
            onClick={() => setFilter("interviews")}
            style={{
              cursor: "pointer",
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 600,
              border: "1.5px dashed hsl(var(--primary) / 0.5)",
              borderRadius: 8,
              background: "hsl(var(--primary) / 0.08)",
              color: "hsl(var(--primary))",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name="calendar" size={16} />
            {interviewCount}{" "}
            {interviewCount === 1 ? "Interview invitation" : "Interview invitations"}
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div
        style={{
          gridColumn: "1 / -1",
          padding: "10px 24px",
          borderBottom: "1px solid var(--border-ds)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "var(--bg-elev)",
          flexWrap: "wrap",
        }}
      >
        {/* Left toolbar group */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select
            value={inboxFilter}
            onChange={(e) => setInboxFilter(e.target.value as "inbox" | "all")}
            style={{
              padding: "6px 10px",
              fontSize: 13,
              fontWeight: 500,
              border: "1px solid var(--border-ds)",
              borderRadius: 6,
              background: "var(--bg)",
              color: "var(--fg)",
              cursor: "pointer",
            }}
          >
            <option value="inbox">Inbox</option>
            <option value="all">All Mail</option>
          </select>

          <button
            type="button"
            onClick={() => setFilter(filter === "unread" ? "inbox" : "unread")}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 500,
              border: filter === "unread" ? "1px solid var(--border-strong)" : "1px solid var(--border-ds)",
              borderRadius: 6,
              background: filter === "unread" ? "var(--bg-sunken)" : "var(--bg)",
              color: "var(--fg)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="circle" size={12} />
            Unread only
          </button>

          <select
            style={{
              padding: "6px 10px",
              fontSize: 13,
              fontWeight: 500,
              border: "1px solid var(--border-ds)",
              borderRadius: 6,
              background: "var(--bg)",
              color: "var(--fg)",
              cursor: "pointer",
            }}
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
          >
            <option value="inbox">All Labels</option>
            <option value="interviews">Interview invitation</option>
            <option value="confirmations">Application Confirmation</option>
            <option value="rejections">Not this time</option>
            <option value="other">Other</option>
          </select>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
            style={{
              padding: "6px 10px",
              fontSize: 13,
              fontWeight: 500,
              border: "1px solid var(--border-ds)",
              borderRadius: 6,
              background: "var(--bg)",
              color: "var(--fg)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>

        {/* Center: Search */}
        <div style={{ flex: 1, minWidth: 200, maxWidth: 400, position: "relative" }}>
          <Icon
            name="search"
            size={14}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--fg-subtle)",
              pointerEvents: "none",
            }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emails..."
            style={{
              width: "100%",
              padding: "7px 12px 7px 34px",
              fontSize: 13,
              border: "1px solid var(--border-ds)",
              borderRadius: 6,
              background: "var(--bg)",
              color: "var(--fg)",
              outline: "none",
            }}
          />
        </div>

        {/* Right toolbar group */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={handleMarkAllRead}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 500,
              border: "1px solid var(--border-ds)",
              borderRadius: 6,
              background: "var(--bg)",
              color: "var(--fg)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="check" size={12} />
            Mark all read
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={syncing}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 500,
              border: "1px solid var(--border-ds)",
              borderRadius: 6,
              background: "var(--bg)",
              color: "var(--fg)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              opacity: syncing ? 0.6 : 1,
            }}
          >
            <Icon name="refresh-cw" size={12} />
            Refresh
          </button>
        </div>

        {syncNotice && (
          <div
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: 12,
              color: "var(--fg-muted)",
              background: "var(--bg-sunken)",
              borderRadius: 6,
              marginTop: 4,
            }}
          >
            {syncNotice}
          </div>
        )}
      </div>

      {/* Left sidebar: message list */}
      <div
        style={{
          borderRight: "1px solid var(--border-ds)",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg)",
        }}
      >
        {/* Select all checkbox */}
        <div
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid var(--border-ds)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <input
            type="checkbox"
            checked={selectedIds.size === filtered.length && filtered.length > 0}
            onChange={toggleSelectAll}
            style={{ width: 16, height: 16, cursor: "pointer" }}
          />
          <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
            Select all on this page
          </span>
        </div>

        {/* Message list */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                color: "var(--fg-muted)",
                fontSize: 14,
              }}
            >
              No messages with this filter.
            </div>
          ) : (
            filtered.map((msg) => {
              const active = msg.id === selected;
              const isSelected = selectedIds.has(msg.id);
              const labelColor = labelCls(msg.kind);
              return (
                <div
                  key={msg.id}
                  onClick={() => setSelected(msg.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 36px minmax(0, 1fr) auto",
                    gap: 12,
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--border-ds)",
                    background: active ? "var(--bg-sunken)" : "transparent",
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = "var(--bg-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = "transparent";
                  }}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleSelect(msg.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: 16, height: 16, cursor: "pointer", marginTop: 4 }}
                  />

                  {/* Avatar */}
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: active
                        ? "hsl(var(--primary))"
                        : "var(--primary-weak)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 14,
                      fontWeight: 700,
                      color: active ? "#FFF" : "hsl(var(--primary))",
                      flexShrink: 0,
                    }}
                  >
                    {msg.from.substring(0, 2).toUpperCase()}
                  </div>

                  {/* Content */}
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: msg.read ? 500 : 700,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        marginBottom: 3,
                        color: "var(--fg)",
                      }}
                    >
                      {msg.from.split("<")[0].trim() || msg.from}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: msg.read ? 400 : 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        marginBottom: 4,
                        color: "var(--fg)",
                      }}
                    >
                      {msg.subject || "(no subject)"}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--fg-muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        marginBottom: 6,
                      }}
                    >
                      {msg.snippet || "..."}
                    </div>
                    {msg.label && (
                      <span
                        className={`ds-chip ${labelColor}`}
                        style={{ fontSize: 11, padding: "3px 8px" }}
                      >
                        {msg.label}
                      </span>
                    )}
                  </div>

                  {/* Date + unread indicator */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 6,
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--fg-subtle)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {fmtDay(msg.date)}
                    </span>
                    {!msg.read && (
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: "hsl(var(--primary))",
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer pagination */}
        {filtered.length > 0 && (
          <div
            style={{
              padding: "12px 16px",
              borderTop: "1px solid var(--border-ds)",
              fontSize: 12,
              color: "var(--fg-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "var(--bg-elev)",
            }}
          >
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              1–{filtered.length} of {messages.length}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                disabled
                style={{
                  padding: "4px 8px",
                  border: "1px solid var(--border-ds)",
                  borderRadius: 4,
                  background: "var(--bg)",
                  cursor: "not-allowed",
                  opacity: 0.5,
                }}
              >
                <Icon name="chevron-left" size={12} />
              </button>
              <button
                type="button"
                disabled
                style={{
                  padding: "4px 8px",
                  border: "1px solid var(--border-ds)",
                  borderRadius: 4,
                  background: "var(--bg)",
                  cursor: "not-allowed",
                  opacity: 0.5,
                }}
              >
                <Icon name="chevron-right" size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right detail pane */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          background: "var(--bg)",
        }}
      >
        {!current ? (
          <div
            style={{
              display: "grid",
              placeItems: "center",
              height: "100%",
              color: "var(--fg-muted)",
              fontSize: 14,
            }}
          >
            Select a message to view
          </div>
        ) : (
          <>
            {/* Detail header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid var(--border-ds)",
              }}
            >
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  marginBottom: 12,
                  lineHeight: 1.3,
                  color: "var(--fg)",
                }}
              >
                {current.subject || "(no subject)"}
              </h2>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 16,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}>
                  {current.from.split("<")[0].trim() || current.from}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--fg-subtle)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmtFull(current.date)}
                </span>
              </div>

              {/* Action bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                {current.applicationId && (
                  <Link
                    href={`/applications?id=${current.applicationId}`}
                    style={{
                      padding: "8px 14px",
                      fontSize: 13,
                      fontWeight: 600,
                      border: "1px solid hsl(var(--primary))",
                      borderRadius: 6,
                      background: "hsl(var(--primary))",
                      color: "#FFF",
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Icon name="file-text" size={14} />
                    View Application
                  </Link>
                )}

                <select
                  value={currentStatus || ""}
                  onChange={(e) =>
                    handleStatusChange((e.target.value || null) as StatusOption)
                  }
                  disabled={!current.applicationId}
                  style={{
                    padding: "8px 12px",
                    fontSize: 13,
                    fontWeight: 500,
                    border: "1px solid var(--border-ds)",
                    borderRadius: 6,
                    background: "var(--bg-elev)",
                    color: "var(--fg)",
                    cursor: current.applicationId ? "pointer" : "not-allowed",
                    opacity: current.applicationId ? 1 : 0.5,
                  }}
                >
                  <option value="">Not this time</option>
                  <option value="interested">Interested</option>
                  <option value="applied">Applied</option>
                  <option value="interviewing">Interviewing</option>
                </select>

                <button
                  type="button"
                  style={{
                    padding: "8px 12px",
                    fontSize: 13,
                    fontWeight: 500,
                    border: "1px solid var(--border-ds)",
                    borderRadius: 6,
                    background: "var(--bg-elev)",
                    color: "var(--fg)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Icon name="reply" size={14} />
                  Reply
                </button>

                <button
                  type="button"
                  style={{
                    padding: "8px 12px",
                    fontSize: 13,
                    fontWeight: 500,
                    border: "1px solid var(--border-ds)",
                    borderRadius: 6,
                    background: "var(--bg-elev)",
                    color: "var(--fg)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Icon name="corner-up-right" size={14} />
                  Forward
                </button>

                <button
                  type="button"
                  style={{
                    padding: "8px 12px",
                    fontSize: 13,
                    fontWeight: 500,
                    border: "1px solid var(--border-ds)",
                    borderRadius: 6,
                    background: "var(--bg-elev)",
                    color: "var(--fg)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Icon name="trash-2" size={14} />
                  Delete
                </button>
              </div>
            </div>

            {/* Message body */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "24px",
              }}
            >
              {current.company && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: 16,
                    background: "var(--bg-sunken)",
                    borderRadius: 10,
                    marginBottom: 24,
                    border: "1px solid var(--border-ds)",
                  }}
                >
                  <CompanyLogo
                    company={current.company}
                    color={companyColor(current.company)}
                    size={48}
                    url=""
                  />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
                      {current.company}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>
                      {current.jobTitle || "Related application"}
                    </div>
                  </div>
                </div>
              )}

              <div
                style={{
                  fontSize: 14,
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                  color: "var(--fg)",
                }}
              >
                {current.bodyText || current.snippet || "No content"}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

