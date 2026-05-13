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
        {/* Mobile topbar — visibile su <1024px sopra al contenuto */}
        <div className="lavorai-mobile-topbar">
          <button
            type="button"
            aria-label="Apri menu"
            className="lavorai-menu-btn"
            onClick={() => setOpen(true)}
          >
            <Icon name="menu" size={18} />
            <span>Menu</span>
          </button>
          <Logo href="/dashboard" size="sm" />
          <Link
            href="/settings"
            className="lavorai-menu-btn"
            aria-label="Impostazioni"
            style={{ padding: "8px 10px" }}
          >
            <Icon name="user" size={16} />
          </Link>
        </div>

        {children}
      </main>

      {/* Floating Action Button (FAB) — sempre visibile su mobile, anche
          se la topbar scrolla via. Quick access al drawer di navigazione.
          Su desktop nascosto perché la sidebar è già fissa a sinistra. */}
      {!open && (
        <button
          type="button"
          className="lavorai-nav-fab"
          onClick={() => setOpen(true)}
          aria-label="Apri menu di navigazione"
        >
          <Icon name="menu" size={22} />
        </button>
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
          overflow: auto;
          background: var(--bg);
          display: flex;
          flex-direction: column;
        }
        .lavorai-mobile-topbar { display: none; }
        .lavorai-sidebar-backdrop { display: none; }
        .lavorai-sidebar-drawer { display: none; }
        .lavorai-nav-fab { display: none; }

        .lavorai-menu-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 12px;
          border-radius: 8px;
          background: var(--bg-elev);
          border: 1px solid var(--border-ds);
          color: var(--fg);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
        }
        .lavorai-menu-btn:hover {
          background: var(--bg-sunken);
        }

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
          .lavorai-nav-fab {
            display: inline-flex;
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 56px;
            height: 56px;
            border-radius: 999px;
            background: hsl(var(--primary));
            color: #001a0d;
            align-items: center;
            justify-content: center;
            border: none;
            box-shadow:
              0 1px 2px rgba(0,0,0,0.18),
              0 8px 24px hsl(var(--primary) / 0.35),
              0 18px 50px rgba(0,0,0,0.30);
            cursor: pointer;
            z-index: 35;
            transition: transform 0.15s ease, box-shadow 0.15s ease;
          }
          .lavorai-nav-fab:hover,
          .lavorai-nav-fab:focus-visible {
            transform: scale(1.05);
            outline: none;
          }
          .lavorai-nav-fab:active {
            transform: scale(0.96);
          }
        }
        @keyframes lavorai-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes lavorai-slide-in { from { transform: translateX(-100%); } to { transform: translateX(0); } }
      `}</style>
    </div>
  );
}
