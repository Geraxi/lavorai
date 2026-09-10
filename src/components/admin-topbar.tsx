"use client";

import Link from "next/link";

import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { AdminBell } from "@/components/admin-bell";
import type { AdminAlert } from "@/lib/admin-alerts";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AdminRangeSelect } from "@/components/admin-range-select";
import { parseRange } from "@/components/admin-range";

const RANGE_PAGES = ["/admin", "/admin/delivery", "/admin/jobs", "/admin/traffic"];

function RangeControlInner({ defaultDays }: { defaultDays: number }) {
  const sp = useSearchParams();
  return <AdminRangeSelect value={parseRange(sp.get("range") ?? undefined, defaultDays)} />;
}
function RangeControl({ defaultDays }: { defaultDays: number }) {
  return <Suspense fallback={null}><RangeControlInner defaultDays={defaultDays} /></Suspense>;
}

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
export function AdminTopbar({ userName, email, alerts = [] }: { userName: string; email?: string; rangeLabel?: string; alerts?: AdminAlert[] }) {
  const pathname = usePathname() ?? "/admin";
  const initials = getInitials(userName);

  const openPalette = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
  };

  return (
    <div
      className="adm-topbar"
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

      {/* Periodo: controllo reale sulle pagine che lo supportano (Panoramica, Consegna, Annunci, Traffico). */}
      {RANGE_PAGES.some((p) => pathname === p) && (
        <RangeControl defaultDays={pathname.startsWith("/admin/traffic") ? 7 : 14} />
      )}

      <span className="adm-pill good">
        <span className="dot" />
        Live
      </span>

      <AdminBell alerts={alerts} />

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
