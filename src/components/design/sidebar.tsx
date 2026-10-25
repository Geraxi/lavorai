"use client";

import Link from "next/link";
import useSWR from "swr";
import { Logo } from "@/components/logo";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import type { IconName } from "@/components/design/icon";
import { LogOut, Settings, Sparkles } from "lucide-react";
import { navIcon } from "@/components/ui-premium/nav-icons";
import { workspaceNavigation, isWorkspaceRouteActive } from "@/lib/workspace-navigation";
import { cn } from "@/lib/utils";
import { AutoApplyToggle } from "@/components/auto-apply-toggle";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

interface SidebarStats {
  applicationsCount: number;
  autoApplyToday: number;
  autoApplyRemaining: number;
}

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
  isAdmin?: boolean;
}

export function AppSidebar({
  applicationsCount: applicationsCountProp,
  autoApplyToday: autoApplyTodayProp,
  autoApplyRemaining: autoApplyRemainingProp,
  userName = "Demo User",
  userPlan = "Pro plan",
  isAdmin = false,
}: SidebarProps) {
  const t = useTranslations("appShell");
  const locale = useLocale();

  // Conteggi via SWR DOPO il primo paint così non bloccano la
  // navigazione. Refresh ogni 30s mentre l'utente naviga, dedupe
  // automatico tra tab/render simultanei. Se le prop arrivano dal
  // server (per back-compat), vengono usate come fallback iniziale
  // prima della prima fetch.
  const { data: stats } = useSWR<SidebarStats>(
    "/api/sidebar-stats",
    fetcher,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
      fallbackData:
        applicationsCountProp !== undefined &&
        autoApplyTodayProp !== undefined &&
        autoApplyRemainingProp !== undefined
          ? {
              applicationsCount: applicationsCountProp,
              autoApplyToday: autoApplyTodayProp,
              autoApplyRemaining: autoApplyRemainingProp,
            }
          : undefined,
    },
  );

  const applicationsCount = stats?.applicationsCount ?? applicationsCountProp;

  const navigation = workspaceNavigation(locale);
  const workItems: NavItem[] = navigation.work;

  // Sezione ADMIN — visibile SOLO al founder (isAdmin dal layout server).
  // Un'unica sidebar: niente nav annidata dentro /admin.
  const adminItems: NavItem[] = [
    { href: "/admin", label: "Panoramica", icon: "dashboard" },
    { href: "/admin/users", label: "Utenti", icon: "user" },
    { href: "/admin/reports", label: locale === "en" ? "User reports" : "Segnalazioni utenti", icon: "inbox" },
    { href: "/admin/product", label: "Product", icon: "target" },
    { href: "/admin/traffic", label: "Traffico", icon: "chart" },
    { href: "/admin/delivery", label: "Consegna", icon: "send" },
    { href: "/admin/email-test", label: "Email test", icon: "send" },
    { href: "/admin/ats-test", label: "ATS test", icon: "briefcase" },
    { href: "/admin/jobs", label: "Job pool", icon: "briefcase" },
    { href: "/admin/automation", label: "Automazione & Utenti", icon: "zap" },
  ];

  const setupItems: NavItem[] = navigation.profile;

  const pathname = usePathname();

  return (
    <aside className="app-sidebar pm-sidebar">
      <div className="pm-sidebar-brand">
        <Logo href="/dashboard" size="sm" />
      </div>

      <nav className="pm-sidebar-nav" aria-label={locale === "en" ? "Sections" : "Sezioni"}>
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
            active={isWorkspaceRouteActive(pathname, it.href)}
          />
        ))}

        {isAdmin && (
          <>
            <SectionLabel>Admin</SectionLabel>
            {adminItems.map((it) => (
              <NavItem key={it.href} item={it} active={isWorkspaceRouteActive(pathname, it.href)} />
            ))}
            <AdminAssistantNavButton />
          </>
        )}

        <SectionLabel>{t("sectionProfile")}</SectionLabel>
        {setupItems.map((it) => (
          <NavItem key={it.href} item={it} active={isWorkspaceRouteActive(pathname, it.href)} />
        ))}
        <LogoutButton />
      </nav>

      <div className="pm-sidebar-foot">
        <div className="pm-sidebar-card">
          <AutoApplyToggle compact locale={locale} />
        </div>
        <Link href="/settings" className="pm-sidebar-user">
          <span className="pm-avatar" aria-hidden>{getInitials(userName)}</span>
          <span className="pm-sidebar-user-text">
            <strong>{userName}</strong>
            <small>{userPlan}</small>
          </span>
          <Settings size={14} strokeWidth={1.75} aria-hidden className="pm-sidebar-user-go" />
        </Link>
      </div>
    </aside>
  );
}

/** Voce "Assistente AI" (solo admin): apre il pannello chat montato nel layout. */
function AdminAssistantNavButton() {
  return (
    <button
      type="button"
      className="ds-nav-item pm-nav-item"
      onClick={() => window.dispatchEvent(new CustomEvent("lavorai:admin-assistant", { detail: { open: true } }))}
    >
      <Sparkles size={16} strokeWidth={1.75} aria-hidden />
      <span className="pm-nav-label">Assistente AI</span>
    </button>
  );
}

function NavItem({ item, active }: { item: NavItem; active: boolean }) {
  const NavIcon = navIcon(item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn("ds-nav-item pm-nav-item", active && "active")}
    >
      <NavIcon size={16} strokeWidth={1.75} aria-hidden />
      <span className="pm-nav-label">{item.label}</span>
      {item.count != null && <span className="pm-nav-count">{item.count}</span>}
    </Link>
  );
}

function LogoutButton() {
  const t = useTranslations("appShell");
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="ds-nav-item pm-nav-item"
    >
      <LogOut size={16} strokeWidth={1.75} aria-hidden />
      <span className="pm-nav-label">{t("logout")}</span>
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="pm-nav-section">{children}</div>;
}

function getInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
