"use client";

/**
 * Card "Traffico globale": lista paesi a sinistra (bandiere SVG, barra, %),
 * globo WebGL a destra. Toggle Mappa/Lista sostituisce il globo con la lista
 * estesa. Wrapper client perché react-globe.gl richiede window (ssr:false).
 */

import dynamic from "next/dynamic";
import { useState } from "react";
import { Globe as GlobeIcon, List as ListIcon, MapPin } from "lucide-react";
import { centroidOf } from "@/lib/country-centroids";

const AdminTrafficGlobe = dynamic(() => import("./admin-traffic-globe").then((m) => m.AdminTrafficGlobe), {
  ssr: false,
  loading: () => (
    <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "var(--fg-subtle)", fontSize: 12 }}>Caricamento globo…</div>
  ),
});

interface Row {
  country: string | null;
  count: number;
}
export interface RegionRow {
  key: string;
  name: string;
  lat: number;
  lng: number;
  count: number;
  topCities: string[];
}

export function AdminTrafficMap({ rows, regions = [], regionsUnresolved = 0, days = 7 }: { rows: Row[]; regions?: RegionRow[]; regionsUnresolved?: number; days?: number }) {
  const [mode, setMode] = useState<"map" | "list" | "regions">("map");
  const regTotal = regions.reduce((s, r) => s + r.count, 0) + regionsUnresolved || 1;
  const regMax = regions[0]?.count ?? 1;
  const total = rows.reduce((s, r) => s + r.count, 0) || 1;
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const max = sorted[0]?.count ?? 1;
  const top = sorted.slice(0, 9);
  const rest = sorted.slice(9).reduce((s, r) => s + r.count, 0);

  return (
    <div style={{ position: "relative", height: "100%", display: "grid", gridTemplateColumns: "minmax(300px, 0.9fr) minmax(0, 1.6fr)", minHeight: 0 }}>
      {/* Header overlay */}
      <div style={{ position: "absolute", top: 14, left: 18, right: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-start", zIndex: 2, pointerEvents: "none" }}>
        <div>
          <div className="adm-card-title" style={{ fontSize: 15 }}>Traffico globale</div>
          <div className="adm-card-sub" style={{ color: "var(--fg-muted)" }}>{mode === "regions" ? `Visite dall'Italia per regione (ultimi ${days} giorni)` : `Utenti per paese (ultimi ${days} giorni)`}</div>
        </div>
        <div role="tablist" style={{ display: "inline-flex", padding: 3, borderRadius: 999, background: "var(--bg-sunken)", border: "1px solid var(--border-ds)", pointerEvents: "auto" }}>
          <Tab active={mode === "map"} onClick={() => setMode("map")} icon={<GlobeIcon size={12} />}>Mappa</Tab>
          <Tab active={mode === "list"} onClick={() => setMode("list")} icon={<ListIcon size={12} />}>Lista</Tab>
          <Tab active={mode === "regions"} onClick={() => setMode("regions")} icon={<MapPin size={12} />}>Regioni IT</Tab>
        </div>
      </div>

      {/* Lista sinistra */}
      <div style={{ padding: "64px 8px 14px 18px", minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {sorted.length === 0 && <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>Nessun dato paese ancora.</div>}
        {top.map((r) => (
          <CountryRow key={r.country ?? "?"} code={r.country} count={r.count} pct={(r.count / total) * 100} bar={(r.count / max) * 100} />
        ))}
        {rest > 0 && <CountryRow code={null} label="Altri" count={rest} pct={(rest / total) * 100} bar={(rest / max) * 100} />}
      </div>

      {/* Destra: globo o lista completa */}
      <div style={{ minHeight: 0, minWidth: 0, position: "relative" }}>
        {mode === "map" ? (
          <AdminTrafficGlobe rows={rows} regions={regions} />
        ) : mode === "regions" ? (
          <div style={{ padding: "64px 18px 14px 8px", height: "100%", overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {regions.length === 0 && <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>Nessuna visita italiana con regione nota nel periodo. Il dato viene salvato dalle visite successive all'attivazione del tracking regionale.</div>}
            {regions.map((r) => (
              <div key={r.key} style={{ display: "grid", gridTemplateColumns: "1fr 110px 40px 40px", gap: 10, alignItems: "center", fontSize: 12.5, padding: "5px 0", borderBottom: "1px solid var(--border-ds)" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="adm-ellipsis" style={{ color: "var(--fg)", fontWeight: 600 }}>{r.name}</div>
                  <div className="adm-ellipsis" style={{ color: "var(--fg-subtle)", fontSize: 11 }}>{r.topCities.join(" · ") || "—"}</div>
                </div>
                <div style={{ height: 5, background: "var(--bg-sunken)", borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${(r.count / regMax) * 100}%`, height: "100%", background: "hsl(var(--primary))", opacity: 0.8 }} /></div>
                <span className="adm-num" style={{ textAlign: "right", color: "var(--fg)", fontWeight: 600 }}>{r.count}</span>
                <span className="adm-num" style={{ textAlign: "right", color: "var(--fg-subtle)" }}>{Math.round((r.count / regTotal) * 100)}%</span>
              </div>
            ))}
            {regionsUnresolved > 0 && <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", paddingTop: 8 }}>{regionsUnresolved} visite italiane senza regione nota.</div>}
          </div>
        ) : (
          <div style={{ padding: "64px 18px 14px 8px", height: "100%", overflowY: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px", alignContent: "start" }}>
            {sorted.map((r) => (
              <CountryRow key={r.country ?? "?"} code={r.country} count={r.count} pct={(r.count / total) * 100} bar={(r.count / max) * 100} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CountryRow({ code, label, count, pct, bar }: { code: string | null; label?: string; count: number; pct: number; bar: number }) {
  const cc = (code ?? "").toLowerCase();
  const valid = /^[a-z]{2}$/.test(cc);
  const info = centroidOf(code);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 90px 36px 40px", gap: 10, alignItems: "center", fontSize: 12.5, padding: "3px 0" }}>
      {valid ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`https://flagcdn.com/${cc}.svg`} alt="" width={22} height={16} loading="lazy" style={{ borderRadius: 3, objectFit: "cover", border: "1px solid var(--border-ds)" }} />
      ) : (
        <span style={{ width: 22, height: 16, borderRadius: 3, background: "var(--bg-sunken)", border: "1px solid var(--border-ds)", display: "grid", placeItems: "center", fontSize: 10, color: "var(--fg-subtle)" }}>+</span>
      )}
      <span className="adm-ellipsis" style={{ color: "var(--fg)" }}>{label ?? info?.name ?? code ?? "Sconosciuto"}</span>
      <div style={{ height: 5, background: "var(--bg-sunken)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${bar}%`, height: "100%", background: "hsl(var(--primary))", opacity: 0.8 }} />
      </div>
      <span className="adm-num" style={{ textAlign: "right", color: "var(--fg)", fontWeight: 600 }}>{count}</span>
      <span className="adm-num" style={{ textAlign: "right", color: "var(--fg-subtle)" }}>{Math.round(pct)}%</span>
    </div>
  );
}

function Tab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 600, background: active ? "hsl(var(--primary))" : "transparent", color: active ? "#04130c" : "var(--fg-muted)", transition: "all 140ms ease" }}
    >
      {icon}
      {children}
    </button>
  );
}
