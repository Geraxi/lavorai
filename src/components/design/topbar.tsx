"use client";

import { Icon } from "@/components/design/icon";
import { ThemeToggle } from "@/components/design/theme-toggle";

export interface TopbarProps {
  title: string;
  breadcrumb?: string;
  actions?: React.ReactNode;
}

export function AppTopbar({ title, breadcrumb, actions }: TopbarProps) {
  return (
    <div
      className="sticky top-0 z-10 flex items-center justify-between border-b"
      style={{
        background: "var(--bg)",
        borderColor: "var(--border-ds)",
        padding: "12px 24px",
      }}
    >
      <div className="flex items-center gap-2" style={{ fontSize: 17, fontWeight: 600 }}>
        {breadcrumb && (
          <>
            <span style={{ color: "var(--fg-subtle)", fontWeight: 400 }}>
              {breadcrumb}
            </span>
            <Icon name="chevron-right" size={15} style={{ opacity: 0.5 }} />
          </>
        )}
        <span>{title}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("lavorai:palette"))}
          aria-label="Cerca (⌘K)"
          className="flex items-center gap-2 rounded border px-2.5 py-1.5 hidden md:flex"
          style={{
            cursor: "text",
            textAlign: "left",
            minWidth: 260,
            background: "var(--bg-elev)",
            borderColor: "var(--border-ds)",
            fontSize: 14.5,
            color: "var(--fg-subtle)",
          }}
        >
          <Icon name="search" size={15} />
          <span style={{ flex: 1, fontSize: 14.5, color: "var(--fg-subtle)" }}>Cerca candidature, aziende...</span>
          <kbd style={{ fontSize: 11, color: "var(--fg-subtle)", border: "1px solid var(--border-ds)", borderRadius: 5, padding: "1px 5px" }}>⌘K</kbd>
        </button>
        {actions}
        <ThemeToggle compact={false} />
      </div>
    </div>
  );
}
