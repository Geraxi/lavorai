"use client";

/**
 * Globo 3D interattivo per /admin/traffic — WebGL via react-globe.gl (three.js).
 * SSR disabilitato: WebGL richiede window. Il caller lo importa con
 * dynamic(..., { ssr: false }).
 *
 * Interazioni: drag per ruotare, wheel per zoom, hover su punto → tooltip.
 * Auto-rotate finché l'utente non interagisce.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import { COUNTRY_CENTROIDS, centroidOf, type CountryInfo } from "@/lib/country-centroids";

interface CountryRow {
  country: string | null;
  count: number;
}

interface Point {
  lat: number;
  lng: number;
  code: string;
  name: string;
  count: number;
  pct: number;
  size: number;
}

interface Arc {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
}

const HUB_CODE = "IT"; // Da qui partono gli archi verso ogni paese di provenienza.
const PRIMARY_GREEN = "rgba(52, 211, 153, 1)";
const PRIMARY_GREEN_SOFT = "rgba(52, 211, 153, 0.35)";

export function AdminTrafficGlobe({ rows, height = 480 }: { rows: CountryRow[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<Point | null>(null);

  // Filtra e mappa a punti geolocalizzati; le righe con codice sconosciuto
  // finiscono in "Altri" (visibili nella lista, non sul globo).
  const { points, arcs, total, unmapped } = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.count, 0) || 1;
    const max = Math.max(1, ...rows.map((r) => r.count));
    const hub = COUNTRY_CENTROIDS[HUB_CODE];
    const points: Point[] = [];
    const arcs: Arc[] = [];
    let unmapped = 0;
    for (const r of rows) {
      const info = centroidOf(r.country);
      if (!info) {
        unmapped += r.count;
        continue;
      }
      const pct = (r.count / total) * 100;
      points.push({
        lat: info.lat,
        lng: info.lng,
        code: (r.country ?? "").toUpperCase(),
        name: info.name,
        count: r.count,
        pct,
        size: 0.25 + (r.count / max) * 0.7,
      });
      if (r.country?.toUpperCase() !== HUB_CODE && hub) {
        arcs.push({
          startLat: hub.lat,
          startLng: hub.lng,
          endLat: info.lat,
          endLng: info.lng,
          color: PRIMARY_GREEN,
        });
      }
    }
    return { points, arcs, total, unmapped };
  }, [rows]);

  // ResizeObserver — il globo va rigenerato con la larghezza del container.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Auto-rotate al mount; stop al primo drag utente.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const controls = g.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    controls.enableZoom = true;
    controls.enablePan = false;
    const stopAuto = () => {
      controls.autoRotate = false;
    };
    controls.addEventListener("start", stopAuto);
    // Punta verso l'Europa all'apertura
    g.pointOfView({ lat: 30, lng: 15, altitude: 2.2 }, 0);
    return () => controls.removeEventListener("start", stopAuto);
  }, [width]);

  const topForLegend = useMemo(
    () => [...points].sort((a, b) => b.count - a.count).slice(0, 10),
    [points],
  );

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height,
        borderRadius: 14,
        overflow: "hidden",
        background: "radial-gradient(ellipse at center, rgba(16,185,129,0.08) 0%, transparent 65%), #05070a",
        border: "1px solid var(--border-ds)",
      }}
    >
      {width > 0 && (
        <Globe
          ref={globeRef}
          width={width}
          height={height}
          backgroundColor="rgba(0,0,0,0)"
          showAtmosphere
          atmosphereColor={PRIMARY_GREEN}
          atmosphereAltitude={0.18}
          // Texture terra "notte" — via unpkg (statico, cached), niente CDN esterni serviti a runtime dal codice del globo.
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
          bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
          pointsData={points}
          pointLat={(d: object) => (d as Point).lat}
          pointLng={(d: object) => (d as Point).lng}
          pointAltitude={(d: object) => (d as Point).size * 0.15}
          pointColor={() => PRIMARY_GREEN}
          pointRadius={(d: object) => (d as Point).size}
          pointLabel={(d: object) => {
            const p = d as Point;
            return `<div style="background:#0a0f14;border:1px solid rgba(52,211,153,0.4);border-radius:8px;padding:8px 12px;font-family:system-ui;color:#e5e7eb;font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,0.5)">
              <div style="font-weight:700;color:#fff;margin-bottom:2px">${p.name}</div>
              <div style="color:#34d399">${p.count} visite</div>
              <div style="color:#9ca3af;font-size:11px">${p.pct.toFixed(pct(p))}% del totale</div>
            </div>`;
          }}
          onPointHover={(d: object | null) => setHover(d as Point | null)}
          arcsData={arcs}
          arcColor={() => [PRIMARY_GREEN_SOFT, PRIMARY_GREEN]}
          arcAltitude={0.22}
          arcStroke={0.35}
          arcDashLength={0.45}
          arcDashGap={0.2}
          arcDashInitialGap={() => Math.random()}
          arcDashAnimateTime={2400}
        />
      )}

      {/* Overlay: badge in alto a sinistra con conteggio totale */}
      <div
        style={{
          position: "absolute",
          top: 14,
          left: 14,
          padding: "8px 12px",
          borderRadius: 10,
          background: "rgba(10,15,20,0.75)",
          border: "1px solid rgba(52,211,153,0.3)",
          backdropFilter: "blur(8px)",
          fontSize: 11.5,
          color: "var(--fg-muted)",
          pointerEvents: "none",
        }}
      >
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-subtle)" }}>Visite totali</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#34d399", letterSpacing: "-0.02em", lineHeight: 1.1, marginTop: 2 }}>{total}</div>
        {unmapped > 0 && (
          <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginTop: 4 }}>
            {unmapped} da paesi non mappati
          </div>
        )}
      </div>

      {/* Overlay: mini-lista top paesi in alto a destra */}
      <div
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          maxWidth: 260,
          padding: "10px 12px",
          borderRadius: 10,
          background: "rgba(10,15,20,0.75)",
          border: "1px solid var(--border-ds)",
          backdropFilter: "blur(8px)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-subtle)", marginBottom: 2 }}>
          Top paesi (7g)
        </div>
        {topForLegend.map((p) => (
          <button
            key={p.code}
            type="button"
            onClick={() => globeRef.current?.pointOfView({ lat: p.lat, lng: p.lng, altitude: 1.6 }, 900)}
            onMouseEnter={() => setHover(p)}
            onMouseLeave={() => setHover(null)}
            style={{
              display: "grid",
              gridTemplateColumns: "20px 1fr auto",
              gap: 8,
              alignItems: "center",
              padding: "3px 4px",
              borderRadius: 6,
              background: hover?.code === p.code ? "rgba(52,211,153,0.12)" : "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 11.5,
              color: "var(--fg)",
              textAlign: "left",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://flagcdn.com/${p.code.toLowerCase()}.svg`}
              alt=""
              width={18}
              height={13}
              loading="lazy"
              style={{ borderRadius: 2, objectFit: "cover" }}
            />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
            <span style={{ color: "var(--fg-muted)", fontFeatureSettings: '"tnum"' }}>
              <strong style={{ color: "var(--fg)" }}>{p.count}</strong>
              <span style={{ marginLeft: 4, fontSize: 10, color: "var(--fg-subtle)" }}>{p.pct.toFixed(pct(p))}%</span>
            </span>
          </button>
        ))}
      </div>

      {/* Hint interazione */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 14,
          fontSize: 10.5,
          color: "var(--fg-subtle)",
          pointerEvents: "none",
        }}
      >
        Trascina per ruotare · scroll per zoom · click su un paese per centrarlo
      </div>
    </div>
  );
}

function pct(p: { pct: number }) {
  return p.pct < 10 ? 1 : 0;
}
