"use client";

import { Icon } from "@/components/design/icon";

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
      <div className="flex items-center gap-2" style={{ fontSize: 14, fontWeight: 600 }}>
        {breadcrumb && (
          <>
            <span style={{ color: "var(--fg-subtle)", fontWeight: 400 }}>
              {breadcrumb}
            </span>
            <Icon name="chevron-right" size={14} style={{ opacity: 0.5 }} />
          </>
        )}
        <span>{title}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div
          className="flex items-center gap-2 rounded border px-2.5 py-1.5"
          style={{
            minWidth: 260,
            background: "var(--bg-elev)",
            borderColor: "var(--border-ds)",
            fontSize: 13,
            color: "var(--fg-subtle)",
          }}
        >
          <Icon name="search" size={14} />
          <input
            placeholder="Cerca candidature, aziende..."
            style={{
              border: "none",
              outline: "none",
              background: "transparent",
              flex: 1,
              color: "var(--fg)",
            }}
          />
          <span className="ds-kbd">⌘K</span>
        </div>
        <button className="ds-btn ds-btn-ghost" type="button">
          <Icon name="bell" size={15} />
        </button>
        {actions}
      </div>
    </div>
  );
}
