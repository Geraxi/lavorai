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
  /** 0..1, ∝ √visite del paese di destinazione (spessore dell'arco). */
  weight?: number;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
}

const HUB_CODE = "IT"; // Da qui partono gli archi verso ogni paese di provenienza.
const PRIMARY_GREEN = "rgba(52, 211, 153, 1)";

export function AdminTrafficGlobe({ rows }: { rows: CountryRow[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const width = size.width;
  const height = size.height;
  const [hover, setHover] = useState<Point | null>(null);

  // Filtra e mappa a punti geolocalizzati; le righe con codice sconosciuto
  // finiscono in "Altri" (visibili nella lista, non sul globo).
  const { points, arcs, unmapped } = useMemo(() => {
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
        size: 0.2 + Math.sqrt(r.count / max) * 0.45,
      });
      if (r.country?.toUpperCase() !== HUB_CODE && hub) {
        arcs.push({
          startLat: hub.lat,
          startLng: hub.lng,
          endLat: info.lat,
          endLng: info.lng,
          color: PRIMARY_GREEN,
          weight: Math.sqrt(r.count / max),
        });
      }
    }
    return { points, arcs, unmapped };
  }, [rows]);

  // ResizeObserver — il globo riempie il contenitore (larghezza E altezza):
  // la card ha altezza da griglia viewport, non fissa.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
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
    g.pointOfView({ lat: 32, lng: 12, altitude: 1.55 }, 0);
    return () => controls.removeEventListener("start", stopAuto);
  }, [width, height]);

  const topPoint = useMemo(
    () => [...points].sort((a, b) => b.count - a.count)[0] ?? null,
    [points],
  );
  // Etichette solo per i primi 6 paesi, per non affollare il globo
  const labels = useMemo(() => [...points].sort((a, b) => b.count - a.count).slice(0, 6), [points]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: "radial-gradient(ellipse at 60% 45%, rgba(16,185,129,0.10) 0%, transparent 60%)",
      }}
    >
      {width > 0 && height > 0 && (
        <Globe
          ref={globeRef}
          width={width}
          height={height}
          backgroundColor="rgba(0,0,0,0)"
          showAtmosphere
          atmosphereColor={PRIMARY_GREEN}
          atmosphereAltitude={0.18}
          // Texture terra "notte" — via unpkg (statico, cached), niente CDN esterni serviti a runtime dal codice del globo.
          globeImageUrl="/textures/earth-night.jpg"
          bumpImageUrl="/textures/earth-topology.png"
          // Punti: dischi bassi e sottili (niente cilindri), dimensione ∝ √visite
          pointsData={points}
          pointLat={(d: object) => (d as Point).lat}
          pointLng={(d: object) => (d as Point).lng}
          pointAltitude={0.006}
          pointColor={() => PRIMARY_GREEN}
          pointRadius={(d: object) => (d as Point).size}
          pointsMerge={false}
          // Anelli che si propagano da ogni paese: raggio ∝ visite, l'Italia (hub) più ampio
          ringsData={points}
          ringLat={(d: object) => (d as Point).lat}
          ringLng={(d: object) => (d as Point).lng}
          ringAltitude={0.008}
          ringColor={() => (t: number) => `rgba(52, 211, 153, ${Math.max(0, 0.9 * (1 - t))})`}
          ringMaxRadius={(d: object) => 2 + (d as Point).size * 9}
          ringPropagationSpeed={(d: object) => 0.8 + (d as Point).size * 2}
          ringRepeatPeriod={(d: object) => ((d as Point).code === HUB_CODE ? 900 : 1600)}
          // Etichette per i paesi principali (nome + visite), senza puntino
          labelsData={labels}
          labelLat={(d: object) => (d as Point).lat}
          labelLng={(d: object) => (d as Point).lng}
          labelText={(d: object) => `${(d as Point).name} · ${(d as Point).count}`}
          labelSize={(d: object) => 0.9 + (d as Point).size * 0.8}
          labelDotRadius={0}
          labelColor={() => "rgba(229,231,235,0.85)"}
          labelAltitude={0.012}
          labelResolution={2}
          labelIncludeDot={false}
          pointLabel={(d: object) => {
            const p = d as Point;
            return `<div style="background:#0a0f14;border:1px solid rgba(52,211,153,0.4);border-radius:8px;padding:8px 12px;font-family:system-ui;color:#e5e7eb;font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,0.5)">
              <div style="font-weight:700;color:#fff;margin-bottom:2px">${p.name}</div>
              <div style="color:#34d399">${p.count} visite</div>
              <div style="color:#9ca3af;font-size:11px">${p.pct.toFixed(pct(p))}% del totale</div>
            </div>`;
          }}
          onPointHover={(d: object | null) => setHover(d as Point | null)}
          // Archi: sottili, altezza proporzionale alla distanza, sfumatura trasparente → verde,
          // spessore ∝ visite del paese di destinazione, scia animata lenta
          arcsData={arcs}
          arcColor={() => ["rgba(52,211,153,0.12)", "rgba(52,211,153,0.75)", "#a7f3d0"]}
          arcAltitudeAutoScale={0.3}
          arcStroke={(d: object) => 0.22 + ((d as Arc).weight ?? 0) * 0.5}
          arcCurveResolution={96}
          arcDashLength={0.5}
          arcDashGap={0.25}
          arcDashInitialGap={() => Math.random()}
          arcDashAnimateTime={3200}
          arcsTransitionDuration={0}
        />
      )}

      {/* Card flottante del paese in hover (come nel mockup) — il paese top
          è mostrato di default finché non si passa su un altro punto. */}
      {(hover ?? topPoint) && (
        <div
          style={{
            position: "absolute",
            top: 64,
            right: 18,
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(10,15,20,0.82)",
            border: "1px solid rgba(52,211,153,0.35)",
            backdropFilter: "blur(8px)",
            pointerEvents: "none",
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://flagcdn.com/${(hover ?? topPoint)!.code.toLowerCase()}.svg`} alt="" width={26} height={19} style={{ borderRadius: 3, objectFit: "cover" }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{(hover ?? topPoint)!.name}</div>
            <div style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>{(hover ?? topPoint)!.count} visite</div>
            <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{(hover ?? topPoint)!.pct.toFixed(pct((hover ?? topPoint)!))}% del totale</div>
          </div>
        </div>
      )}

      {/* Hint interazione + paesi non mappati */}
      <div style={{ position: "absolute", bottom: 10, right: 16, fontSize: 10.5, color: "var(--fg-subtle)", pointerEvents: "none", textAlign: "right" }}>
        Trascina per ruotare · scroll per zoom
        {unmapped > 0 && <span> · {unmapped} visite da paesi non mappati</span>}
      </div>
    </div>
  );
}

function pct(p: { pct: number }) {
  return p.pct < 10 ? 1 : 0;
}
