"use client";

import { usePathname } from "next/navigation";
import { Search, Calendar, ChevronDown, Bell } from "lucide-react";

const TITLES: Record<string, string> = {
  "/admin": "Panoramica",
  "/admin/traffic": "Traffico",
  "/admin/delivery": "Consegna",
  "/admin/users": "Utenti",
  "/admin/jobs": "Job pool",
  "/admin/automation": "Automazione & Utenti",
};

/**
 * Topbar admin: search ⌘K · range · Live · campanella · avatar.
 * Il search apre la CommandPalette globale (⌘K già gestita dall'app).
 */
export function AdminTopbar({ userName, email, rangeLabel = "Ultimi 14 giorni" }: { userName: string; email?: string; rangeLabel?: string }) {
  const pathname = usePathname() ?? "/admin";
  const initials = getInitials(userName);

  const openPalette = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 22px",
        borderBottom: "1px solid var(--border-ds)",
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        onClick={openPalette}
        style={{
          flex: "0 1 460px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          borderRadius: 10,
          background: "var(--bg-sunken)",
          border: "1px solid var(--border-ds)",
          color: "var(--fg-subtle)",
          fontSize: 12.5,
          cursor: "text",
          textAlign: "left",
        }}
      >
        <Search size={14} />
        <span style={{ flex: 1 }}>Cerca utenti, candidature, aziende…</span>
        <kbd
          style={{
            fontSize: 10.5,
            padding: "2px 6px",
            borderRadius: 5,
            background: "var(--bg-elev)",
            border: "1px solid var(--border-ds)",
            color: "var(--fg-muted)",
            fontFamily: "inherit",
          }}
        >
          ⌘K
        </kbd>
      </button>

      <div style={{ flex: 1 }} />

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 12px",
          borderRadius: 10,
          background: "var(--bg-sunken)",
          border: "1px solid var(--border-ds)",
          fontSize: 12.5,
          color: "var(--fg)",
        }}
      >
        <Calendar size={13} style={{ color: "var(--fg-subtle)" }} />
        {rangeLabel}
        <ChevronDown size={13} style={{ color: "var(--fg-subtle)" }} />
      </div>

      <span className="adm-pill good">
        <span className="dot" />
        Live
      </span>

      <button
        type="button"
        aria-label="Notifiche"
        style={{
          position: "relative",
          width: 34,
          height: 34,
          borderRadius: 10,
          background: "transparent",
          border: "none",
          color: "var(--fg-muted)",
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
        }}
      >
        <Bell size={16} />
        <span
          style={{
            position: "absolute",
            top: 5,
            right: 5,
            width: 7,
            height: 7,
            borderRadius: 999,
            background: "#f87171",
            boxShadow: "0 0 0 2px var(--bg)",
          }}
        />
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 9, paddingLeft: 6 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            background: "var(--bg-sunken)",
            border: "1px solid var(--border-ds)",
            display: "grid",
            placeItems: "center",
            fontSize: 11.5,
            fontWeight: 700,
            color: "var(--fg)",
          }}
        >
          {initials}
        </div>
        <div style={{ lineHeight: 1.15 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--fg)" }}>{userName}</div>
          <div style={{ fontSize: 11, color: "var(--fg-subtle)" }} title={TITLES[pathname] ?? "Admin"}>{email || "Admin"}</div>
        </div>
      </div>
    </div>
  );
}

function getInitials(name: string): string {
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
