"use client";

import Link from "next/link";
import { Logo } from "@/components/logo";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/design/icon";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  count?: string | number | null;
}

export interface SidebarProps {
  applicationsCount?: number;
  autoApplyOn?: boolean;
  autoApplyToday?: number;
  autoApplyRemaining?: number;
  userName?: string;
  userPlan?: string;
}

export function AppSidebar({
  applicationsCount,
  autoApplyOn = true,
  autoApplyToday = 22,
  autoApplyRemaining = 78,
  userName = "Demo User",
  userPlan = "Pro plan",
}: SidebarProps) {
  const t = useTranslations("appShell");

  const workItems: NavItem[] = [
    { href: "/dashboard", label: t("dashboard"), icon: "dashboard" },
    { href: "/discover", label: t("discover"), icon: "sparkles" },
    { href: "/applications", label: t("applications"), icon: "briefcase", count: null },
    { href: "/jobs", label: t("jobs"), icon: "inbox" },
    { href: "/analytics", label: t("analytics"), icon: "chart" },
  ];

  const setupItems: NavItem[] = [
    { href: "/preferences", label: t("preferences"), icon: "target" },
    { href: "/cv", label: t("materials"), icon: "file" },
    { href: "/settings", label: t("account"), icon: "settings" },
  ];

  const pathname = usePathname();

  return (
    <aside
      className="sticky top-0 flex h-screen flex-col gap-0.5 border-r px-3 py-3.5"
      style={{
        background: "var(--bg)",
        borderColor: "var(--border-ds)",
      }}
    >
      {/* Brand */}
      <div className="px-2 pb-3.5 pt-1">
        <Logo href="/dashboard" size="sm" />
      </div>

      <SectionLabel>{t("sectionWork")}</SectionLabel>
      {workItems.map((it) => (
        <NavItem
          key={it.href}
          item={{
            ...it,
            count:
              it.href === "/applications" && applicationsCount != null
                ? applicationsCount
                : it.count,
          }}
          active={isActive(pathname, it.href)}
        />
      ))}

      <SectionLabel>{t("sectionProfile")}</SectionLabel>
      {setupItems.map((it) => (
        <NavItem key={it.href} item={it} active={isActive(pathname, it.href)} />
      ))}
      <LogoutButton />


      {/* Auto-apply status + user card */}
      <div className="mt-auto pt-3">
        <div
          className="rounded-lg border p-3"
          style={{
            background: "var(--bg-sunken)",
            borderColor: "var(--border-ds)",
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "ds-dot ds-dot-green",
                autoApplyOn && "ds-dot-pulse",
              )}
            />
            <span
              style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}
            >
              {t("autoApply")} · {autoApplyOn ? "ON" : "OFF"}
            </span>
          </div>
          <div
            className="mono mt-1"
            style={{ fontSize: 11, color: "var(--fg-muted)" }}
          >
            {t("appsToday", { count: autoApplyToday })} · {t("remaining", { count: autoApplyRemaining })}
          </div>
          <div
            className="mt-2.5 overflow-hidden rounded"
            style={{
              height: 4,
              background: "var(--border-ds)",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, (autoApplyToday / (autoApplyToday + autoApplyRemaining)) * 100)}%`,
                background: "var(--primary-ds)",
              }}
            />
          </div>
        </div>

        <Link
          href="/settings"
          className="mt-1 flex items-center gap-2.5 rounded-md px-2 py-2.5 transition-colors"
          style={{
            textDecoration: "none",
            color: "inherit",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-sunken)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          <div
            className="flex items-center justify-center rounded-full font-semibold text-white"
            style={{
              width: 26,
              height: 26,
              background: "linear-gradient(135deg,#d9a0a0,#b0628a)",
              fontSize: 11,
              flexShrink: 0,
            }}
          >
            {getInitials(userName)}
          </div>
          <div className="min-w-0 flex-1">
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {userName}
            </div>
            <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
              {userPlan}
            </div>
          </div>
          <Icon
            name="settings"
            size={13}
            style={{ color: "var(--fg-subtle)", flexShrink: 0 }}
          />
        </Link>
      </div>
    </aside>
  );
}

function NavItem({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn("ds-nav-item", active && "active")}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 8px",
        borderRadius: "var(--radius-sm)",
        fontSize: 13,
        color: active ? "var(--fg)" : "var(--fg-muted)",
        transition: "color 0.2s cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active-pill"
          className="pointer-events-none absolute inset-0"
          style={{
            borderRadius: "var(--radius-sm)",
            background: "var(--bg-elev)",
            border: "1px solid var(--border-ds)",
            boxShadow: "var(--shadow-sm)",
            zIndex: 0,
          }}
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
        />
      )}
      <span
        className="relative z-10 flex min-w-0 flex-1 items-center gap-2.5"
      >
        <Icon
          name={item.icon}
          size={15}
          style={{ flexShrink: 0, opacity: active ? 1 : 0.75 }}
        />
        <span className="truncate">{item.label}</span>
      </span>
      {item.count != null && (
        <span
          className="relative z-10 mono"
          style={{
            fontSize: 10.5,
            color: "var(--fg-subtle)",
            flexShrink: 0,
          }}
        >
          {item.count}
        </span>
      )}
    </Link>
  );
}

function LogoutButton() {
  const t = useTranslations("appShell");
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="ds-nav-item"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "6px 8px",
        borderRadius: "var(--radius-sm)",
        fontSize: 13,
        color: "var(--fg-muted)",
        background: "transparent",
        border: "1px solid transparent",
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
        transition: "background 0.1s, color 0.1s",
      }}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <Icon
          name="arrow-up-right"
          size={15}
          style={{ flexShrink: 0, opacity: 0.75 }}
        />
        <span>{t("logout")}</span>
      </span>
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "10px 8px 4px",
        fontSize: 10.5,
        fontWeight: 500,
        color: "var(--fg-subtle)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      {children}
    </div>
  );
}

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

function getInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
