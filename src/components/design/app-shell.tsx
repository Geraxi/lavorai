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
  const mobileNavItems = [
    { href: "/dashboard", label: "Home", icon: "dashboard" as const },
    { href: "/discover", label: "Scopri", icon: "sparkles" as const },
    { href: "/applications", label: "Candidature", icon: "briefcase" as const },
    { href: "/inbox", label: "Inbox", icon: "inbox" as const },
  ];

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

      {/* I percorsi quotidiani restano a portata di pollice; il drawer
          conserva le sezioni meno frequenti. */}
      {!open && (
        <nav className="lavorai-mobile-bottom-nav" aria-label="Navigazione principale">
          {mobileNavItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
            return (
              <Link key={item.href} href={item.href} className="lavorai-mobile-nav-item" aria-current={active ? "page" : undefined}>
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <button type="button" className="lavorai-mobile-nav-item lavorai-mobile-nav-menu" onClick={() => setOpen(true)} aria-label="Apri tutte le sezioni">
            <Icon name="menu" size={19} />
            <span>Altro</span>
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
          overflow: auto;
          background: var(--bg);
          display: flex;
          flex-direction: column;
        }
        .lavorai-mobile-topbar { display: none; }
        .lavorai-sidebar-backdrop { display: none; }
        .lavorai-sidebar-drawer { display: none; }
        .lavorai-mobile-bottom-nav { display: none; }

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
          .lavorai-main {
            padding-bottom: calc(88px + env(safe-area-inset-bottom));
          }
          .lavorai-mobile-bottom-nav {
            position: fixed;
            left: max(12px, env(safe-area-inset-left));
            right: max(12px, env(safe-area-inset-right));
            bottom: max(12px, env(safe-area-inset-bottom));
            z-index: 35;
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 2px;
            min-height: 62px;
            padding: 5px;
            border: 1px solid rgba(184, 255, 226, 0.22);
            border-radius: 22px;
            background: linear-gradient(135deg, rgba(9, 22, 26, 0.82), rgba(10, 34, 29, 0.68));
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), 0 16px 44px rgba(0,0,0,0.42), 0 2px 12px rgba(31, 224, 155, 0.10);
            backdrop-filter: blur(20px) saturate(150%);
            -webkit-backdrop-filter: blur(20px) saturate(150%);
          }
          .lavorai-mobile-nav-item {
            display: flex;
            min-width: 0;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 3px;
            border-radius: 17px;
            color: rgba(233, 246, 240, 0.66);
            text-decoration: none;
            font-size: 10px;
            font-weight: 650;
            line-height: 1;
            letter-spacing: -0.01em;
            transition: color .18s ease, background .18s ease, transform .18s ease;
          }
          .lavorai-mobile-nav-item[aria-current="page"] {
            color: #04150e;
            background: linear-gradient(135deg, hsl(var(--primary)), #7cf2be);
            box-shadow: inset 0 1px 0 rgba(255,255,255,.34), 0 5px 16px hsl(var(--primary) / .28);
          }
          .lavorai-mobile-nav-item:active { transform: scale(.95); }
          .lavorai-mobile-nav-item:focus-visible { outline: 2px solid #b9ffde; outline-offset: 2px; }
          .lavorai-mobile-nav-menu { border: 0; background: transparent; font: inherit; cursor: pointer; }
          .lavorai-mobile-nav-menu:hover { color: #fff; background: rgba(255,255,255,.08); }
          @media (prefers-reduced-motion: reduce) { .lavorai-mobile-nav-item { transition: none; } }
          }
        }
        @keyframes lavorai-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes lavorai-slide-in { from { transform: translateX(-100%); } to { transform: translateX(0); } }
      `}</style>
    </div>
  );
}
