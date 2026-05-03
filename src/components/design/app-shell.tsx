"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { usePathname } from "next/navigation";
import { AppSidebar, type SidebarProps } from "@/components/design/sidebar";
import { Icon } from "@/components/design/icon";

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
      className="font-sans lavorai-app-shell"
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
          <div className="lavorai-sidebar-drawer">
            <AppSidebar {...sidebarProps} />
          </div>
        </>
      )}

      {/* Main */}
      <main
        id="main-content"
        className="ds-scroll lavorai-main"
      >
        {/* Mobile topbar */}
        <div className="lavorai-mobile-topbar">
          <button
            type="button"
            aria-label="Apri menu"
            className="ds-btn ds-btn-ghost"
            onClick={() => setOpen(true)}
            style={{ padding: 8 }}
          >
            <Icon name="menu" size={20} />
          </button>
          <Logo href="/dashboard" size="sm" />
          <Link
            href="/settings"
            className="ds-btn ds-btn-ghost"
            style={{ padding: 8 }}
            aria-label="Impostazioni"
          >
            <Icon name="user" size={16} />
          </Link>
        </div>

        {children}
      </main>

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
          overflow: auto;
          background: var(--bg);
          display: flex;
          flex-direction: column;
        }
        .lavorai-mobile-topbar { display: none; }
        .lavorai-sidebar-backdrop { display: none; }
        .lavorai-sidebar-drawer { display: none; }

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
            width: 260px;
            z-index: 50;
            animation: lavorai-slide-in 0.25s cubic-bezier(0.2, 0.8, 0.3, 1);
            overflow-y: auto;
          }
        }
        @keyframes lavorai-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes lavorai-slide-in { from { transform: translateX(-100%); } to { transform: translateX(0); } }
      `}</style>
    </div>
  );
}
