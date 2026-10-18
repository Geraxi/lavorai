"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HScroll } from "@/components/h-scroll";

/**
 * Nav sezioni admin per telefono/tablet (<1024px), sotto la topbar.
 * Su desktop le sezioni sono nella sidebar; su mobile la sidebar sta nel
 * drawer, quindi qui una barra scorrevole col dito porta a ogni pagina.
 * Etichette identiche a sidebar e growth nav.
 */
const ITEMS: Array<{ href: string; label: string }> = [
  { href: "/admin", label: "Panoramica" },
  { href: "/admin/users", label: "Utenti" },
  { href: "/admin/reports", label: "Segnalazioni utenti" },
  { href: "/admin/growth", label: "Growth" },
  { href: "/admin/revenue", label: "Revenue" },
  { href: "/admin/outcomes", label: "Outcomes" },
  { href: "/admin/product", label: "Product" },
  { href: "/admin/traffic", label: "Traffico" },
  { href: "/admin/delivery", label: "Consegna" },
  { href: "/admin/reliability", label: "Affidabilità" },
  { href: "/admin/jobs", label: "Job pool" },
  { href: "/admin/automation", label: "Automazione & Utenti" },
  { href: "/admin/db-health", label: "DB health" },
];

export function AdminMobileNav() {
  const pathname = usePathname() ?? "/admin";
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <HScroll as="nav" ariaLabel="Sezioni admin" className="adm-mobile-nav">
      {ITEMS.map((item) => {
        const active = isActive(item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className="adm-mobile-nav-item">
            {item.label}
          </Link>
        );
      })}
    </HScroll>
  );
}
