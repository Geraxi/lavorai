"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
}

const ITEMS: NavItem[] = [
  { href: "/admin", label: "Panoramica" },
  { href: "/admin/traffic", label: "Traffico" },
  { href: "/admin/delivery", label: "Consegna" },
  { href: "/admin/users", label: "Utenti" },
  { href: "/admin/jobs", label: "Job pool" },
  { href: "/admin/system", label: "Salute AI" },
  { href: "/admin/test", label: "Test invio" },
  { href: "/admin/nudges", label: "Nudge" },
  { href: "/admin/popups", label: "Popup" },
  { href: "/admin/assistant", label: "AI chat" },
];

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
        gap: 1,
        borderRight: "1px solid var(--border-ds)",
        paddingRight: 16,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          color: "var(--fg-subtle)",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          padding: "2px 10px 10px",
          fontWeight: 600,
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
              display: "block",
              padding: "7px 10px",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              background: active ? "var(--bg-elev)" : "transparent",
              color: active ? "var(--fg)" : "var(--fg-muted)",
            }}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
