"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/design/icon";
import { CompanyLogo, companyColor } from "@/components/design/company-logo";
import Link from "next/link";

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

type Filter = "inbox" | "unread" | "interviews" | "rejections" | "confirmations";

const fmtDay = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
};

const fmtFull = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Gmail-style inbox view matching AIApply screenshot.
 * Two-pane layout: list on left, detail on right.
 */
export function GmailInboxView({ messages, gmailConnected, userEmail, interviewCount }: InboxViewProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("inbox");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(messages[0]?.id ?? null);
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const filtered = messages.filter((m) => {
    if (filter === "unread" && m.read) return false;
    if (filter === "interviews" && m.kind !== "colloquio") return false;
    if (filter === "rejections" && m.kind !== "rifiutata") return false;
    if (filter === "confirmations" && m.kind !== "ricevuta") return false;
    if (search) {
      const needle = search.toLowerCase();
      const haystack = `${m.from} ${m.subject} ${m.snippet}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
          <form action="/api/auth/signin/google" method="POST">
            <button
              type="submit"
              className="ds-btn ds-btn-primary"
              style={{ width: "100%" }}
            >
              <Icon name="mail" size={14} />
              Collega Gmail
            </button>
          </form>
          <p style={{ fontSize: 12, color: "var(--fg-subtle)" }}>
            Le tue email non vengono mai inviate o modificate. Accesso in sola
            lettura.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fit-page"
      style={{
        gridTemplateColumns: "360px minmax(0, 1fr)",
        gridTemplateRows: "auto minmax(0, 1fr)",
        gap: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          gridColumn: "1 / -1",
          padding: "14px 20px",
          borderBottom: "1px solid var(--border-ds)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          background: "var(--bg)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Inbox</h1>
          {userEmail && (
            <div
              style={{
                fontSize: 13,
                color: "var(--fg-muted)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                border: "1px solid var(--border-ds)",
                borderRadius: 6,
              }}
            >
              <Icon name="mail" size={12} />
              {userEmail}
            </div>
          )}
        </div>
        {interviewCount > 0 && (
          <button
            type="button"
            onClick={() => setFilter("interviews")}
            className="ds-chip ds-chip-purple"
            style={{
              cursor: "pointer",
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <Icon name="calendar" size={12} />
            {interviewCount}{" "}
            {interviewCount === 1 ? "Interview invitation" : "Interview invitations"}
          </button>
        )}
      </div>

      {/* Left sidebar: filters + message list */}
      <div
        className="fit-card"
        style={{
          padding: 0,
          borderRadius: 0,
          border: "none",
          borderRight: "1px solid var(--border-ds)",
        }}
      >
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid var(--border-ds)",
            display: "grid",
            gap: 10,
          }}
        >
          {/* Search */}
          <div style={{ position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: 10,
                top: 9,
                color: "var(--fg-subtle)",
              }}
            >
              <Icon name="search" size={13} />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search emails..."
              className="fit-input"
              style={{ paddingLeft: 32, fontSize: 13 }}
            />
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <FilterButton
              active={filter === "inbox"}
              onClick={() => setFilter("inbox")}
              icon="inbox"
              label="Inbox"
              count={messages.length}
            />
            <FilterButton
              active={filter === "unread"}
              onClick={() => setFilter("unread")}
              icon="circle"
              label="Unread only"
              count={messages.filter((m) => !m.read).length}
            />
          </div>

          {/* Labels */}
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-subtle)", marginTop: 4 }}>
            All Labels ▼
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <LabelButton
              active={filter === "interviews"}
              onClick={() => setFilter("interviews")}
              label="Interview invitation"
              color="green"
              count={messages.filter((m) => m.kind === "colloquio").length}
            />
            <LabelButton
              active={filter === "confirmations"}
              onClick={() => setFilter("confirmations")}
              label="Application Confirmation"
              color="blue"
              count={messages.filter((m) => m.kind === "ricevuta").length}
            />
            <LabelButton
              active={filter === "rejections"}
              onClick={() => setFilter("rejections")}
              label="Not this time"
              color="red"
              count={messages.filter((m) => m.kind === "rifiutata").length}
            />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="ds-btn ds-btn-sm"
              style={{ flex: 1, fontSize: 11 }}
            >
              <Icon name="check" size={10} />
              Mark all read
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={syncing}
              className="ds-btn ds-btn-sm"
              style={{ flex: 1, fontSize: 11 }}
            >
              <Icon name="refresh-cw" size={10} />
              {syncing ? "Syncing..." : "Refresh"}
            </button>
          </div>

          {syncNotice && (
            <div
              style={{
                fontSize: 11,
                color: "var(--fg-muted)",
                padding: "6px 8px",
                background: "var(--bg-sunken)",
                borderRadius: 4,
              }}
            >
              {syncNotice}
            </div>
          )}

          {/* Newest sort indicator */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "var(--fg-subtle)",
              marginTop: 4,
            }}
          >
            <Icon name="arrow-down" size={10} />
            Newest
          </div>
        </div>

        {/* Message list */}
        <div className="fit-body fit-scroll" style={{ padding: 0 }}>
          {filtered.length === 0 ? (
            <div
              style={{
                padding: 32,
                textAlign: "center",
                color: "var(--fg-muted)",
                fontSize: 13,
              }}
            >
              Nessun messaggio con questo filtro.
            </div>
          ) : (
            filtered.map((msg) => {
              const active = msg.id === selected;
              const labelColor = labelCls(msg.kind);
              return (
                <button
                  key={msg.id}
                  type="button"
                  onClick={() => setSelected(msg.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "32px minmax(0, 1fr) auto",
                    gap: 10,
                    padding: "12px 14px",
                    borderBottom: "1px solid var(--border-ds)",
                    background: active ? "var(--bg-sunken)" : "transparent",
                    borderLeft: active ? "3px solid hsl(var(--primary))" : "3px solid transparent",
                    textAlign: "left",
                    width: "100%",
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
                  {/* Avatar */}
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: "var(--primary-weak)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "hsl(var(--primary))",
                      flexShrink: 0,
                    }}
                  >
                    {msg.from.charAt(0).toUpperCase()}
                  </div>

                  {/* Content */}
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: msg.read ? 500 : 700,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        marginBottom: 2,
                      }}
                    >
                      {msg.from}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: msg.read ? 400 : 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        marginBottom: 4,
                      }}
                    >
                      {msg.subject || "(no subject)"}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "var(--fg-muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {msg.snippet || "..."}
                    </div>
                    {msg.label && (
                      <span
                        className={`ds-chip ${labelColor}`}
                        style={{ marginTop: 6, display: "inline-block", fontSize: 10 }}
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
                      gap: 4,
                      flexShrink: 0,
                    }}
                  >
                    <span
                      className="mono"
                      style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}
                    >
                      {fmtDay(msg.date)}
                    </span>
                    {!msg.read && (
                      <span
                        className="ds-dot ds-dot-purple"
                        style={{ width: 8, height: 8 }}
                      />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer pagination */}
        {filtered.length > 0 && (
          <div
            style={{
              padding: "8px 14px",
              borderTop: "1px solid var(--border-ds)",
              fontSize: 11,
              color: "var(--fg-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>
              1–{filtered.length} of {filtered.length}
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <button type="button" className="ds-btn ds-btn-sm" disabled>
                <Icon name="chevron-left" size={10} />
              </button>
              <button type="button" className="ds-btn ds-btn-sm" disabled>
                <Icon name="chevron-right" size={10} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right detail pane */}
      <div
        className="fit-card"
        style={{ padding: 0, borderRadius: 0, border: "none" }}
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
            Seleziona un messaggio
          </div>
        ) : (
          <>
            {/* Detail header */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--border-ds)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 16,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    marginBottom: 8,
                    lineHeight: 1.3,
                  }}
                >
                  {current.subject || "(no subject)"}
                </h2>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
                    {current.from}
                  </span>
                  <span
                    className="mono"
                    style={{ fontSize: 11, color: "var(--fg-subtle)" }}
                  >
                    {fmtFull(current.date)}
                  </span>
                  {current.label && (
                    <span className={`ds-chip ${labelCls(current.kind)}`}>
                      {current.label}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions dropdown */}
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {current.applicationId && (
                  <Link
                    href={`/applications?id=${current.applicationId}`}
                    className="ds-btn ds-btn-sm ds-btn-primary"
                  >
                    <Icon name="file-text" size={12} />
                    View Application
                  </Link>
                )}
                <button type="button" className="ds-btn ds-btn-sm">
                  <Icon name="reply" size={12} />
                  Reply
                </button>
                <button type="button" className="ds-btn ds-btn-sm">
                  <Icon name="corner-up-right" size={12} />
                  Forward
                </button>
                <button type="button" className="ds-btn ds-btn-sm">
                  <Icon name="trash-2" size={12} />
                  Delete
                </button>
              </div>
            </div>

            {/* Message body */}
            <div
              className="fit-body fit-scroll"
              style={{ padding: "24px 20px" }}
            >
              {current.company && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: 14,
                    background: "var(--bg-sunken)",
                    borderRadius: 8,
                    marginBottom: 20,
                  }}
                >
                  <CompanyLogo
                    company={current.company}
                    color={companyColor(current.company)}
                    size={40}
                    url=""
                  />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {current.company}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                      {current.jobTitle || "Candidatura collegata"}
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

function FilterButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ds-btn ds-btn-sm ${active ? "ds-btn-primary" : ""}`}
      style={{ padding: "4px 9px", fontSize: 11 }}
    >
      <Icon name={icon} size={10} />
      {label}
      <span style={{ opacity: 0.65, fontVariantNumeric: "tabular-nums" }}>
        {count}
      </span>
    </button>
  );
}

function LabelButton({
  active,
  onClick,
  label,
  color,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color: "green" | "blue" | "red" | "purple";
  count: number;
}) {
  const colorMap = {
    green: "#16a34a",
    blue: "#2563eb",
    red: "#dc2626",
    purple: "hsl(var(--primary))",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        background: active ? "var(--bg-sunken)" : "transparent",
        border: "none",
        borderRadius: 4,
        fontSize: 12,
        textAlign: "left",
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
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: colorMap[color],
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </span>
      <span
        style={{
          fontSize: 11,
          color: "var(--fg-subtle)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count}
      </span>
    </button>
  );
}
