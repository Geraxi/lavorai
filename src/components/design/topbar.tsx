"use client";

import { ChevronRight, Search } from "lucide-react";
import { ThemeToggle } from "@/components/design/theme-toggle";
import { useLocale } from "next-intl";

export interface TopbarProps {
  title: string;
  breadcrumb?: string;
  actions?: React.ReactNode;
}

/**
 * Matte top bar: page title on the left, a quiet section switcher and
 * ghost/outline actions on the right. Visuals: ui-premium/shell.css.
 */
export function AppTopbar({ title, breadcrumb, actions }: TopbarProps) {
  const en = useLocale() === "en";
  return (
    <div className="workspace-topbar pm-topbar">
      <div className="pm-topbar-title">
        {breadcrumb && (
          <>
            <span className="pm-topbar-crumb">{breadcrumb}</span>
            <ChevronRight size={14} strokeWidth={1.75} aria-hidden className="pm-topbar-sep" />
          </>
        )}
        <span>{title}</span>
      </div>
      <div className="pm-topbar-actions">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("lavorai:palette"))}
          aria-label={en ? "Go to a section (⌘K)" : "Vai a una sezione (⌘K)"}
          className="pm-topbar-search"
        >
          <Search size={14} strokeWidth={1.75} aria-hidden />
          <span>{en ? "Go to a section…" : "Vai a una sezione…"}</span>
          <kbd>⌘K</kbd>
        </button>
        {actions}
        <ThemeToggle compact locale={en ? "en" : "it"} />
      </div>
    </div>
  );
}
