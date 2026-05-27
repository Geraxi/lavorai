"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const ITEMS: NavItem[] = [
  { href: "/admin", label: "Panoramica", icon: "📊" },
  { href: "/admin/traffic", label: "Traffico", icon: "📈" },
  { href: "/admin/delivery", label: "Consegna", icon: "🚚" },
  { href: "/admin/users", label: "Utenti", icon: "👤" },
  { href: "/admin/jobs", label: "Job pool", icon: "💼" },
  { href: "/admin/system", label: "Salute AI", icon: "🤖" },
  { href: "/admin/test", label: "Test invio", icon: "🧪" },
  { href: "/admin/nudges", label: "Nudge", icon: "✉️" },
  { href: "/admin/popups", label: "Popup", icon: "📣" },
  { href: "/admin/assistant", label: "AI chat", icon: "💬" },
];

/**
 * Sidebar dedicata alla sezione /admin. Ogni voce è una vera sub-route
 * (non un'ancora). Active state via usePathname.
 */
export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Admin"
      style={{
        position: "sticky",
        top: 20,
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
        Admin
      </div>
      {ITEMS.map((it) => {
        const active =
          it.href === "/admin"
            ? pathname === "/admin"
            : pathname === it.href || pathname?.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 10px",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              background: active ? "var(--bg)" : "transparent",
              color: active ? "var(--fg)" : "var(--fg-muted)",
              transition: "background 0.12s, color 0.12s",
            }}
          >
            <span style={{ width: 18, fontSize: 14 }}>{it.icon}</span>
            <span>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
