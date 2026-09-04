"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Activity,
  Send,
  Users,
  Briefcase,
  HeartPulse,
  Zap,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group?: string;
}

const ITEMS: NavItem[] = [
  { href: "/admin", label: "Panoramica", icon: LayoutDashboard, group: "Metriche" },
  { href: "/admin/traffic", label: "Traffico", icon: Activity, group: "Metriche" },
  { href: "/admin/delivery", label: "Consegna", icon: Send, group: "Metriche" },
  { href: "/admin/users", label: "Utenti", icon: Users, group: "Metriche" },
  { href: "/admin/jobs", label: "Job pool", icon: Briefcase, group: "Metriche" },
  { href: "/admin/automation", label: "Automazione & Utenti", icon: Zap, group: "Operazioni" },
  { href: "/admin/system", label: "Salute AI", icon: HeartPulse, group: "Operazioni" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  const groups = ITEMS.reduce<Record<string, NavItem[]>>((acc, it) => {
    const g = it.group ?? "Altro";
    (acc[g] ??= []).push(it);
    return acc;
  }, {});

  return (
    <nav
      aria-label="Admin"
      style={{
        position: "sticky",
        top: 20,
        alignSelf: "start",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        borderRight: "1px solid var(--border-ds)",
        paddingRight: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 10px 14px",
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary)/0.6))",
            display: "grid",
            placeItems: "center",
            color: "#0a0a0a",
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: "-0.02em",
          }}
        >
          L
        </div>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span style={{ fontSize: 12, color: "var(--fg)", fontWeight: 700, letterSpacing: "-0.01em" }}>Admin</span>
          <span style={{ fontSize: 9.5, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 600 }}>
            Console
          </span>
        </div>
      </div>

      {Object.entries(groups).map(([group, items], gi) => (
        <div key={group} style={{ marginTop: gi === 0 ? 0 : 14 }}>
          <div
            style={{
              fontSize: 9.5,
              color: "var(--fg-subtle)",
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              padding: "0 10px 6px",
              fontWeight: 600,
            }}
          >
            {group}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {items.map((it) => {
              const active =
                it.href === "/admin"
                  ? pathname === "/admin"
                  : pathname === it.href || pathname?.startsWith(it.href + "/");
              const Icon = it.icon;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    padding: "7px 10px",
                    borderRadius: 7,
                    textDecoration: "none",
                    fontSize: 12.5,
                    fontWeight: active ? 600 : 500,
                    background: active ? "var(--bg-elev)" : "transparent",
                    color: active ? "var(--fg)" : "var(--fg-muted)",
                    border: active ? "1px solid var(--border-ds)" : "1px solid transparent",
                    transition: "background 120ms ease, color 120ms ease",
                  }}
                >
                  {active && (
                    <span
                      aria-hidden
                      style={{
                        position: "absolute",
                        left: -1,
                        top: "22%",
                        bottom: "22%",
                        width: 2,
                        borderRadius: 2,
                        background: "hsl(var(--primary))",
                      }}
                    />
                  )}
                  <Icon size={14} strokeWidth={active ? 2.2 : 1.8} />
                  {it.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
