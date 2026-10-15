"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/design/icon";

import { useLocale } from "next-intl";
import { workspaceNavigation } from "@/lib/workspace-navigation";
import { useModalFocus } from "./use-modal-focus";

interface Command {
  id: string;
  label: string;
  hint: string;
  icon: IconName;
  action: () => void;
}

export function CommandPalette() {
  const router = useRouter();
  const locale = useLocale();
  const en = locale === "en";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useModalFocus(open, panel, close);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
      }
      if (e.key === "Escape") setOpen(false);
    };
    // Apertura da UI (es. campo ricerca nella topbar).
    const onOpen = () => { setOpen(true); setQuery(""); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("lavorai:palette", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("lavorai:palette", onOpen); };
  }, []);

  const navigation = workspaceNavigation(locale);
  const commands: Command[] = [...navigation.work, ...navigation.profile].map(item => ({
    id: item.href, label: item.label, hint: "", icon: item.icon, action: () => router.push(item.href),
  }));

  const filtered = query
    ? commands.filter((c) =>
        (c.label + " " + c.hint).toLowerCase().includes(query.toLowerCase()),
      )
    : commands;

  if (!open) return null;

  return (
    <div
      className="product-workspace"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(15,16,18,0.4)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
      }}
      onClick={() => setOpen(false)}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={en ? "Go to a section" : "Vai a una sezione"}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg)",
          border: "1px solid var(--border-ds)",
          borderRadius: "var(--radius-lg)",
          width: 540,
          maxWidth: "92vw",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 18px",
            borderBottom: "1px solid var(--border-ds)",
          }}
        >
          <Icon name="search" size={16} style={{ color: "var(--fg-subtle)" }} />
          <input
            data-modal-autofocus
            aria-label={en ? "Find a section" : "Cerca una sezione"}
            onKeyDown={event => { if (event.key === "Enter" && filtered.length) { event.preventDefault(); filtered[0].action(); close(); } }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={en ? "Go to a section…" : "Vai a una sezione…"}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 14,
              color: "var(--fg)",
            }}
          />
          <button type="button" onClick={close} aria-label={en ? "Close navigation" : "Chiudi navigazione"} style={{ minWidth: 36, minHeight: 36 }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ maxHeight: "min(420px, 55dvh)", overflow: "auto" }}>
          {filtered.length === 0 ? (
            <div
              style={{
                padding: "24px 18px",
                textAlign: "center",
                fontSize: 13,
                color: "var(--fg-muted)",
              }}
            >
              {en ? "No matching section. Try another name." : "Nessuna sezione trovata. Prova un altro nome."}
            </div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  c.action();
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 18px",
                  minHeight: 44,
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "var(--fg)",
                  fontSize: 13.5,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--bg-sunken)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <Icon name={c.icon} size={14} style={{ color: "var(--fg-muted)" }} />
                <span style={{ fontWeight: 500 }}>{c.label}</span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 11.5,
                    color: "var(--fg-subtle)",
                  }}
                >
                  {c.hint}
                </span>
                <Icon
                  name="arrow-right"
                  size={12}
                  style={{ color: "var(--fg-subtle)" }}
                />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
