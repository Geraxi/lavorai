"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, AlertOctagon, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import type { AdminAlert } from "@/lib/admin-alerts";

const TONE = {
  bad: { color: "#f87171", Icon: AlertOctagon },
  warn: { color: "#fbbf24", Icon: AlertTriangle },
  info: { color: "#60a5fa", Icon: Info },
} as const;

/** Campanella admin: popover con gli alert live, ognuno cliccabile verso la pagina dove agire. */
export function AdminBell({ alerts }: { alerts: AdminAlert[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const worst = alerts.some((a) => a.tone === "bad") ? "bad" : alerts.some((a) => a.tone === "warn") ? "warn" : null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label={`Notifiche${alerts.length ? ` (${alerts.length})` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "relative", width: 34, height: 34, borderRadius: 10, border: "none",
          background: open ? "var(--bg-sunken)" : "transparent", color: open ? "var(--fg)" : "var(--fg-muted)",
          display: "grid", placeItems: "center", cursor: "pointer",
        }}
      >
        <Bell size={16} />
        {worst && (
          <span style={{ position: "absolute", top: 5, right: 5, width: 7, height: 7, borderRadius: 999, background: TONE[worst].color, boxShadow: "0 0 0 2px var(--bg)" }} />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifiche"
          style={{
            position: "absolute", top: 40, right: 0, width: 340, zIndex: 60,
            background: "var(--bg-elev)", border: "1px solid var(--border-ds)", borderRadius: 14,
            boxShadow: "0 16px 40px rgba(0,0,0,0.35)", overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--border-ds)" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>Notifiche</span>
            <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{alerts.length === 0 ? "tutto ok" : `${alerts.length} attive`}</span>
          </div>
          {alerts.length === 0 ? (
            <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "16px 14px", color: "var(--fg-muted)", fontSize: 12.5 }}>
              <CheckCircle2 size={16} style={{ color: "hsl(var(--primary))" }} />
              Nessun alert attivo: crediti, worker e job pool nella norma.
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 6, display: "grid", gap: 2 }}>
              {alerts.map((a) => {
                const { color, Icon } = TONE[a.tone];
                return (
                  <li key={a.id}>
                    <Link
                      href={a.href}
                      onClick={() => setOpen(false)}
                      style={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: 10, padding: "9px 10px", borderRadius: 10, color: "inherit", textDecoration: "none" }}
                      className="adm-bell-item"
                    >
                      <Icon size={15} style={{ color, marginTop: 1 }} />
                      <span>
                        <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, lineHeight: 1.3 }}>{a.title}</span>
                        <span style={{ display: "block", fontSize: 11.5, color: "var(--fg-muted)", lineHeight: 1.4 }}>{a.detail}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <Link href="/admin#alerts" onClick={() => setOpen(false)} style={{ display: "block", padding: "9px 14px", borderTop: "1px solid var(--border-ds)", fontSize: 11.5, color: "var(--fg-muted)", textDecoration: "none" }}>
            Vedi il pannello alert nella Panoramica →
          </Link>
          <style>{`.adm-bell-item:hover { background: var(--bg-sunken); }`}</style>
        </div>
      )}
    </div>
  );
}
