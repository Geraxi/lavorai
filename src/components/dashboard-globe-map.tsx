"use client";

/**
 * Wrapper client del globo dashboard: dynamic import (WebGL, no SSR),
 * legenda con filtri attivabili e hint interazione.
 */

import dynamic from "next/dynamic";
import { useState } from "react";
import { Icon } from "@/components/design/icon";
import type { CityMarker, GlobeFilters } from "./dashboard-globe";

const DashboardGlobe = dynamic(() => import("./dashboard-globe").then((m) => m.DashboardGlobe), {
  ssr: false,
  loading: () => (
    <div style={{ width: "100%", height: "100%", minHeight: 420, display: "grid", placeItems: "center", color: "var(--fg-subtle)", fontSize: 12.5 }}>
      Carico il globo…
    </div>
  ),
});

const LEGEND: Array<{ key: keyof GlobeFilters; label: string; color: string; icon: "map-pin" | "send" | "star" }> = [
  { key: "open", label: "Posizioni aperte", color: "#22c55e", icon: "map-pin" },
  { key: "sent", label: "Candidature inviate", color: "#3b82f6", icon: "send" },
  { key: "ready", label: "Posizioni pronte", color: "#f59e0b", icon: "star" },
];

export function DashboardGlobeMap({ markers, height }: { markers: CityMarker[]; height?: number }) {
  const [filters, setFilters] = useState<GlobeFilters>({ open: true, sent: true, ready: true });
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: height ?? 480 }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <DashboardGlobe markers={markers} filters={filters} height={height ?? 560} />
      </div>
      {/* Legenda / filtri */}
      <div className="fit-card" style={{ position: "absolute", top: 12, right: 12, padding: "10px 12px", gap: 6, width: 200, background: "rgba(10,14,20,0.72)", backdropFilter: "blur(10px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
          <Icon name="filter" size={13} /> Filtri mappa
        </div>
        {LEGEND.map((l) => (
          <button
            key={l.key}
            type="button"
            onClick={() => setFilters((f) => ({ ...f, [l.key]: !f[l.key] }))}
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: filters[l.key] ? "var(--fg)" : "var(--fg-subtle)", background: "transparent", border: "none", padding: "3px 0", cursor: "pointer", textAlign: "left", opacity: filters[l.key] ? 1 : 0.55 }}
          >
            <span style={{ width: 9, height: 9, borderRadius: 999, background: l.color, boxShadow: filters[l.key] ? `0 0 8px ${l.color}` : "none" }} />
            {l.label}
          </button>
        ))}
      </div>
      <div style={{ position: "absolute", left: 14, bottom: 10, fontSize: 11, color: "var(--fg-subtle)", pointerEvents: "none" }}>
        Trascina per ruotare · scroll per zoom · passa sui pin per il dettaglio
      </div>
    </div>
  );
}
