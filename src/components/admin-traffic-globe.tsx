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

export interface RegionPoint { key: string; name: string; lat: number; lng: number; count: number }

export function AdminTrafficGlobe({ rows, regions = [] }: { rows: CountryRow[]; regions?: RegionPoint[] }) {
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
      // Italia: se abbiamo il dettaglio regionale, una barra per regione al posto di quella nazionale
      if (r.country?.toUpperCase() === HUB_CODE && regions.length > 0) {
        for (const g of regions) {
          points.push({ lat: g.lat, lng: g.lng, code: `IT-${g.key}`, name: `${g.name} (Italia)`, count: g.count, pct: (g.count / total) * 100, size: 0.18 + Math.sqrt(g.count / max) * 0.32 });
        }
        continue;
      }
      points.push({
        lat: info.lat,
        lng: info.lng,
        code: (r.country ?? "").toUpperCase(),
        name: info.name,
        count: r.count,
        pct,
        size: 0.18 + Math.sqrt(r.count / max) * 0.32,
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
  }, [rows, regions]);

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
    g.pointOfView({ lat: 32, lng: 12, altitude: 1.05 }, 0); // più vicino: il globo riempie la card
    return () => controls.removeEventListener("start", stopAuto);
  }, [width, height]);

  const topPoint = useMemo(
    () => [...points].sort((a, b) => b.count - a.count)[0] ?? null,
    [points],
  );

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
          // Barre in rilievo: altezza ∝ √visite (l'Italia svetta senza schiacciare
          // gli altri), raggio contenuto, colore verde con leggera trasparenza.
          pointsData={points}
          pointLat={(d: object) => (d as Point).lat}
          pointLng={(d: object) => (d as Point).lng}
          pointAltitude={(d: object) => 0.02 + (d as Point).size * 0.22}
          pointColor={(d: object) => ((d as Point).code.startsWith("IT") ? "#6ee7b7" : "rgba(52, 211, 153, 0.92)")}
          pointRadius={(d: object) => (d as Point).size * 0.5}
          pointResolution={24}
          pointsMerge={false}
          // Un solo anello che pulsa dall'hub (Italia): dà vita senza affollare.
          ringsData={points.filter((p) => p.code === HUB_CODE || (p.code.startsWith("IT-") && p.count === Math.max(...points.filter((q) => q.code.startsWith("IT-")).map((q) => q.count))))}
          ringLat={(d: object) => (d as Point).lat}
          ringLng={(d: object) => (d as Point).lng}
          ringAltitude={0.01}
          ringColor={() => (t: number) => `rgba(52, 211, 153, ${Math.max(0, 0.6 * (1 - t))})`}
          ringMaxRadius={4}
          ringPropagationSpeed={1.2}
          ringRepeatPeriod={1400}
          onPointHover={(d: object | null) => setHover(d as Point | null)}
          // Archi: sottili, altezza proporzionale alla distanza, sfumatura trasparente → verde,
          // spessore ∝ visite del paese di destinazione, scia animata lenta
          arcsData={arcs}
          arcColor={() => ["rgba(52,211,153,0.2)", "rgba(52,211,153,0.85)", "#a7f3d0"]}
          arcAltitudeAutoScale={0.4}
          arcStroke={(d: object) => 0.22 + ((d as Arc).weight ?? 0) * 0.36}
          arcCurveResolution={128}
          arcDashLength={0.5}
          arcDashGap={0.22}
          arcDashInitialGap={() => Math.random()}
          arcDashAnimateTime={2600}
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
          <img src={`https://flagcdn.com/${(hover ?? topPoint)!.code.slice(0, 2).toLowerCase()}.svg`} alt="" width={26} height={19} style={{ borderRadius: 3, objectFit: "cover" }} />
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
