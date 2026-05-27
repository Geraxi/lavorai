"use client";

import { useEffect, useState } from "react";

interface NavItem {
  id: string;
  label: string;
  icon?: string;
}

/**
 * Sidebar verticale sticky dentro /admin per navigare tra le sezioni.
 * Click → smooth scroll all'id corrispondente. Scrollspy: evidenzia la
 * sezione visibile in viewport.
 */
export function AdminSubNav({ items }: { items: NavItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    // Scrollspy con IntersectionObserver
    const obs = new IntersectionObserver(
      (entries) => {
        // sceglie la sezione più visibile in alto
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );
    for (const it of items) {
      const el = document.getElementById(it.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [items]);

  function go(id: string) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActive(id);
    }
  }

  return (
    <nav
      aria-label="Sezioni admin"
      style={{
        position: "sticky",
        top: 24,
        alignSelf: "start",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: 10,
        background: "var(--bg-elev)",
        border: "1px solid var(--border-ds)",
        borderRadius: 12,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          color: "var(--fg-subtle)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          padding: "4px 10px 8px",
        }}
      >
        Sezioni
      </div>
      {items.map((it) => {
        const isActive = it.id === active;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => go(it.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 10px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              background: isActive ? "var(--bg)" : "transparent",
              color: isActive ? "var(--fg)" : "var(--fg-muted)",
              textAlign: "left",
              transition: "background 0.12s, color 0.12s",
            }}
          >
            {it.icon && <span style={{ width: 18, fontSize: 14 }}>{it.icon}</span>}
            <span>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
