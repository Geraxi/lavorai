"use client";

/**
 * Wrapper client-side per il globo WebGL. Necessario perché react-globe.gl usa
 * three.js che richiede window/document — deve stare fuori dall'SSR.
 * Fornisce anche il toggle Mappa/Lista.
 */

import dynamic from "next/dynamic";
import { useState } from "react";
import { Globe as GlobeIcon, List as ListIcon } from "lucide-react";
import { centroidOf } from "@/lib/country-centroids";

const AdminTrafficGlobe = dynamic(
  () => import("./admin-traffic-globe").then((m) => m.AdminTrafficGlobe),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: "100%",
          height: 480,
          borderRadius: 14,
          background: "radial-gradient(ellipse at center, rgba(16,185,129,0.06) 0%, transparent 65%), #05070a",
          border: "1px solid var(--border-ds)",
          display: "grid",
          placeItems: "center",
          color: "var(--fg-subtle)",
          fontSize: 12,
        }}
      >
        Caricamento globo…
      </div>
    ),
  },
);

interface Row {
  country: string | null;
  count: number;
}

export function AdminTrafficMap({ rows }: { rows: Row[] }) {
  const [mode, setMode] = useState<"map" | "list">("map");
  const total = rows.reduce((s, r) => s + r.count, 0) || 1;
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const max = sorted[0]?.count ?? 1;

  return (
    <div style={{ marginTop: 22 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
          gap: 12,
        }}
      >
        <div style={{ fontSize: 12, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 8 }}>
          <GlobeIcon size={14} />
          Traffico globale · 7g
        </div>
        <div
          role="tablist"
          style={{
            display: "inline-flex",
            padding: 3,
            borderRadius: 999,
            background: "var(--bg-sunken)",
            border: "1px solid var(--border-ds)",
          }}
        >
          <TabBtn active={mode === "map"} onClick={() => setMode("map")} icon={<GlobeIcon size={12} />}>
            Mappa
          </TabBtn>
          <TabBtn active={mode === "list"} onClick={() => setMode("list")} icon={<ListIcon size={12} />}>
            Lista
          </TabBtn>
        </div>
      </div>

      {mode === "map" ? (
        <AdminTrafficGlobe rows={rows} />
      ) : (
        <div
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border-ds)",
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          {sorted.map((r, i) => {
            const info = centroidOf(r.country);
            const pct = (r.count / total) * 100;
            const barPct = (r.count / max) * 100;
            const cc = (r.country ?? "").toLowerCase();
            const valid = /^[a-z]{2}$/.test(cc);
            return (
              <div
                key={r.country ?? `${i}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "28px 1fr auto 76px",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 14px",
                  borderBottom: i === sorted.length - 1 ? "none" : "1px solid var(--border-ds)",
                }}
              >
                {valid ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`https://flagcdn.com/${cc}.svg`}
                    alt=""
                    width={22}
                    height={16}
                    loading="lazy"
                    style={{ borderRadius: 3, border: "1px solid var(--border-ds)", objectFit: "cover" }}
                  />
                ) : (
                  <span aria-hidden style={{ width: 22, height: 16, borderRadius: 3, background: "var(--bg-sunken)", border: "1px solid var(--border-ds)", display: "grid", placeItems: "center", fontSize: 10 }}>
                    🌐
                  </span>
                )}
                <span style={{ fontSize: 12.5, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {info?.name ?? r.country ?? "Sconosciuto"}
                  {r.country && <span style={{ color: "var(--fg-subtle)", marginLeft: 6, fontSize: 11 }}>{r.country.toUpperCase()}</span>}
                </span>
                <div style={{ width: 90, height: 5, background: "var(--bg-sunken)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${barPct}%`, height: "100%", background: "hsl(var(--primary))", opacity: 0.75 }} />
                </div>
                <div style={{ textAlign: "right", fontSize: 12.5, color: "var(--fg-muted)", fontFeatureSettings: '"tnum"' }}>
                  <strong style={{ color: "var(--fg)", fontWeight: 700 }}>{r.count}</strong>
                  <span style={{ marginLeft: 6, color: "var(--fg-subtle)", fontSize: 10.5 }}>{pct.toFixed(pct < 10 ? 1 : 0)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 12px",
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        fontSize: 11.5,
        fontWeight: 600,
        background: active ? "hsl(var(--primary))" : "transparent",
        color: active ? "#0a0a0a" : "var(--fg-muted)",
        transition: "all 140ms ease",
      }}
    >
      {icon}
      {children}
    </button>
  );
}
