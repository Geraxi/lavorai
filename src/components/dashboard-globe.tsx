"use client";

/**
 * Globo 3D della dashboard utente (react-globe.gl / three.js, WebGL).
 * Pin per città: posizioni aperte (verde), candidature inviate (blu),
 * posizioni pronte da inviare (giallo). Drag per ruotare, scroll per zoom,
 * hover per il dettaglio. SSR disabilitato dal wrapper (dynamic ssr:false).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";

export interface CityMarker {
  key: string;
  name: string;
  lat: number;
  lng: number;
  open: number;
  sent: number;
  ready: number;
}

export interface GlobeFilters {
  open: boolean;
  sent: boolean;
  ready: boolean;
}

const COLORS = { open: "#22c55e", sent: "#3b82f6", ready: "#f59e0b" } as const;

type Pt = { lat: number; lng: number; color: string; size: number; label: string; kind: keyof typeof COLORS; name: string; n: number };
type Lbl = { lat: number; lng: number; text: string; size: number; color: string };

export function DashboardGlobe({ markers, filters, height = 560 }: { markers: CityMarker[]; filters: GlobeFilters; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const c = g.controls();
    c.autoRotate = true;
    c.autoRotateSpeed = 0.5;
    c.enableZoom = true;
    c.enablePan = false;
    c.minDistance = 160;
    c.maxDistance = 420;
    const stop = () => { c.autoRotate = false; };
    c.addEventListener("start", stop);
    g.pointOfView({ lat: 38, lng: 8, altitude: 1.9 }, 0);
    return () => c.removeEventListener("start", stop);
  }, [width]);

  const { points, labels } = useMemo(() => {
    const points: Pt[] = [];
    const maxOpen = Math.max(1, ...markers.map((m) => m.open));
    for (const m of markers) {
      if (filters.open && m.open > 0) points.push({ lat: m.lat, lng: m.lng, color: COLORS.open, size: 0.35 + (m.open / maxOpen) * 0.9, label: `${m.name} · ${m.open} posizioni aperte`, kind: "open", name: m.name, n: m.open });
      if (filters.sent && m.sent > 0) points.push({ lat: m.lat + 0.9, lng: m.lng + 0.9, color: COLORS.sent, size: 0.45, label: `${m.name} · ${m.sent} candidature inviate`, kind: "sent", name: m.name, n: m.sent });
      if (filters.ready && m.ready > 0) points.push({ lat: m.lat - 0.9, lng: m.lng - 0.9, color: COLORS.ready, size: 0.42, label: `${m.name} · ${m.ready} posizioni pronte`, kind: "ready", name: m.name, n: m.ready });
    }
    const labels: Lbl[] = [...markers]
      .filter((m) => (filters.open && m.open > 0) || (filters.sent && m.sent > 0) || (filters.ready && m.ready > 0))
      .sort((a, b) => b.open + b.sent * 3 - (a.open + a.sent * 3))
      .slice(0, 14)
      .map((m) => ({ lat: m.lat, lng: m.lng, text: `${m.name} · ${m.open > 0 ? `${m.open} posizioni` : m.sent > 0 ? `${m.sent} inviate` : `${m.ready} pronte`}`, size: 1.05, color: "rgba(255,255,255,0.92)" }));
    return { points, labels };
  }, [markers, filters]);

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", height, overflow: "hidden", borderRadius: 20 }}>
      {width > 0 && (
        <Globe
          ref={globeRef}
          width={width}
          height={height}
          backgroundColor="rgba(0,0,0,0)"
          showAtmosphere
          atmosphereColor="#7dd3fc"
          atmosphereAltitude={0.16}
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
          bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
          pointsData={points}
          pointLat={(d: object) => (d as Pt).lat}
          pointLng={(d: object) => (d as Pt).lng}
          pointColor={(d: object) => (d as Pt).color}
          pointAltitude={(d: object) => 0.02 + (d as Pt).size * 0.05}
          pointRadius={(d: object) => (d as Pt).size * 0.55}
          pointLabel={(d: object) => {
            const p = d as Pt;
            return `<div style="background:#0b1220;border:1px solid ${p.color}66;border-radius:10px;padding:8px 12px;font-family:system-ui;color:#e5e7eb;font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,.5)"><div style="font-weight:700;color:#fff">${p.name}</div><div style="color:${p.color}">${p.n} ${p.kind === "open" ? "posizioni aperte" : p.kind === "sent" ? "candidature inviate" : "posizioni pronte"}</div></div>`;
          }}
          labelsData={labels}
          labelLat={(d: object) => (d as Lbl).lat}
          labelLng={(d: object) => (d as Lbl).lng}
          labelText={(d: object) => (d as Lbl).text}
          labelSize={(d: object) => (d as Lbl).size}
          labelColor={(d: object) => (d as Lbl).color}
          labelDotRadius={0.25}
          labelAltitude={0.02}
          labelResolution={2}
        />
      )}
    </div>
  );
}
