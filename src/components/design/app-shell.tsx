"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { AppSidebar, type SidebarProps } from "@/components/design/sidebar";
import { Menu, UserRound, X } from "lucide-react";
import { navIcon } from "@/components/ui-premium/nav-icons";
import { workspaceNavigation, isWorkspaceRouteActive } from "@/lib/workspace-navigation";
import { useModalFocus } from "./use-modal-focus";
import "./user-workspace.css";
import "./product-workspace.css";
import "@/components/ui-premium/premium.css";
import "@/components/ui-premium/shell.css";
import "@/components/ui-premium/legacy.css";

/**
 * Responsive app shell.
 * - Desktop (>=1024px): sidebar fissa a sinistra + main
 * - Mobile (<1024px): sidebar overlay + hamburger in mobile header
 */
export function AppShell({
  sidebarProps,
  children,
}: {
  sidebarProps: SidebarProps;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const en = useLocale() === "en";
  const mobileNavItems = workspaceNavigation(en ? "en" : "it").work.slice(0, 4);
  const drawer = useRef<HTMLDivElement>(null);
  const closeDrawer = useCallback(() => setOpen(false), []);
  useModalFocus(open, drawer, closeDrawer);

  // Chiudi automaticamente il drawer quando si naviga
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Chiudi con ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className={`font-sans lavorai-app-shell product-workspace${["/dashboard", "/discover", "/applications", "/inbox", "/materiali", "/feedback"].includes(pathname) ? " reference-workspace" : ""}`}
      style={{
        background: "var(--bg)",
        color: "var(--fg)",
        fontSize: 14,
        minHeight: "100vh",
      }}
    >
      {/* Desktop sidebar */}
      <div className="lavorai-sidebar-desktop">
        <AppSidebar {...sidebarProps} />
      </div>

      {/* Mobile drawer */}
      {open && (
        <>
          <div
            className="lavorai-sidebar-backdrop"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="lavorai-sidebar-drawer" ref={drawer} role="dialog" aria-modal="true" aria-label={en ? "Navigation" : "Navigazione"} tabIndex={-1}>
            <button className="lavorai-drawer-close" type="button" onClick={closeDrawer}>{en ? "Close menu" : "Chiudi menu"}<X size={18} strokeWidth={1.75} aria-hidden /></button>
            <AppSidebar {...sidebarProps} />
          </div>
        </>
      )}

      {/* Main */}
      <main
        id="main-content"
        inert={open}
        className="ds-scroll lavorai-main"
      >
        {/* Mobile topbar — visibile su <1024px sopra al contenuto */}
        <div className="lavorai-mobile-topbar">
          <button
            type="button"
            aria-label={en ? "Open menu" : "Apri menu"}
            aria-expanded={open}
            className="lavorai-menu-btn"
            onClick={() => setOpen(true)}
          >
            <Menu size={17} strokeWidth={1.75} aria-hidden />
            <span>Menu</span>
          </button>
          <Logo href="/dashboard" size="sm" />
          <Link
            href="/settings"
            className="lavorai-menu-btn is-icon"
            aria-label={en ? "Settings" : "Impostazioni"}
          >
            <UserRound size={16} strokeWidth={1.75} aria-hidden />
          </Link>
        </div>

        {children}
      </main>

      {/* I percorsi quotidiani restano a portata di pollice; il drawer
          conserva le sezioni meno frequenti. */}
      {!open && (
        <nav className="lavorai-mobile-bottom-nav" aria-label={en ? "Main navigation" : "Navigazione principale"}>
          {mobileNavItems.map((item) => {
            const active = isWorkspaceRouteActive(pathname, item.href);
            const NavIcon = navIcon(item.href);
            return (
              <Link key={item.href} href={item.href} className="lavorai-mobile-nav-item" aria-current={active ? "page" : undefined}>
                <NavIcon size={19} strokeWidth={1.75} aria-hidden />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <button type="button" className="lavorai-mobile-nav-item lavorai-mobile-nav-menu" onClick={() => setOpen(true)} aria-label={en ? "Open all sections" : "Apri tutte le sezioni"}>
            <Menu size={19} strokeWidth={1.75} aria-hidden />
            <span>{en ? "More" : "Altro"}</span>
          </button>
        </nav>
      )}

      <style>{`
        .lavorai-app-shell {
          display: grid;
          grid-template-columns: 232px 1fr;
          height: 100vh;
        }
        .lavorai-sidebar-desktop {
          display: block;
          height: 100vh;
          overflow-y: auto;
        }
        .lavorai-main {
          min-width: 0;
          overflow: auto;
          background: var(--bg);
          display: flex;
          flex-direction: column;
        }
        .lavorai-mobile-topbar { display: none; }
        .lavorai-sidebar-backdrop { display: none; }
        .lavorai-sidebar-drawer { display: none; }
        .lavorai-mobile-bottom-nav { display: none; }

        /* Menu button visuals: src/components/ui-premium/shell.css */

        @media (max-width: 1023px) {
          .lavorai-app-shell {
            grid-template-columns: 1fr;
          }
          .lavorai-sidebar-desktop {
            display: none;
          }
          .lavorai-mobile-topbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 14px;
            border-bottom: 1px solid var(--border-ds);
            background: var(--bg);
            position: sticky;
            top: 0;
            z-index: 30;
          }
          .lavorai-sidebar-backdrop {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(15,16,18,0.5);
            z-index: 40;
            animation: lavorai-fade-in 0.2s ease;
          }
          .lavorai-sidebar-drawer {
            display: block;
            position: fixed;
            top: 0;
            bottom: 0;
            left: 0;
            width: 280px;
            max-width: 86vw;
            z-index: 50;
            animation: lavorai-slide-in 0.25s cubic-bezier(0.2, 0.8, 0.3, 1);
            overflow-y: auto;
          }
          .lavorai-main {
            padding-bottom: calc(88px + env(safe-area-inset-bottom));
          }
          /* Il main è lo scroller del documento su mobile: i figli non devono
             restringersi sotto il contenuto, altrimenti l'ultima sezione
             finisce sotto la bottom nav senza poter scorrere. */
          .lavorai-main > * { flex-shrink: 0; }
          /* Bottom nav visuals: src/components/ui-premium/shell.css */
        }
        @keyframes lavorai-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes lavorai-slide-in { from { transform: translateX(-100%); } to { transform: translateX(0); } }
      `}</style>
    </div>
  );
}
