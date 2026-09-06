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
  /** Primi annunci aperti in città (titolo · azienda), per il pannello. */
  samples?: Array<{ title: string; company: string | null }>;
}

export interface GlobeFilters {
  open: boolean;
  sent: boolean;
  ready: boolean;
}

const COLORS = { open: "#22c55e", sent: "#3b82f6", ready: "#f59e0b" } as const;


export function DashboardGlobe({ markers, filters, onSelect }: { markers: CityMarker[]; filters: GlobeFilters; height?: number; onSelect?: (m: CityMarker | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const personElRef = useRef<HTMLDivElement | null>(null);
  const width = size.w;
  const height = size.h;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
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
    // Limiti di zoom: il globo non deve mai uscire dal riquadro (il
    // contenitore ha comunque overflow hidden).
    c.minDistance = 190;
    c.maxDistance = 380;
    const stop = () => { c.autoRotate = false; };
    c.addEventListener("start", stop);
    // La persona è un elemento HTML (px): la scaliamo col raggio apparente del
    // globo, così resta ~1/3 del raggio a qualsiasi zoom invece di dominare
    // la scena quando la Terra è piccola.
    const cam = g.camera() as { position: { length: () => number }; fov?: number };
    const fitPerson = () => {
      const el = personElRef.current;
      if (!el || !height) return;
      const dist = cam.position.length();
      const fov = ((cam.fov ?? 50) * Math.PI) / 180;
      const radiusPx = (100 / dist) * (height / 2) / Math.tan(fov / 2);
      const w = Math.max(28, Math.min(120, radiusPx * 0.34));
      el.style.width = `${w}px`;
    };
    fitPerson();
    c.addEventListener("change", fitPerson);
    const t = setInterval(fitPerson, 500); // primo render / resize
    g.pointOfView({ lat: 38, lng: 8, altitude: 1.9 }, 0);
    return () => { c.removeEventListener("start", stop); c.removeEventListener("change", fitPerson); clearInterval(t); };
  }, [width, height]);

  type Pin = { type: "pin"; lat: number; lng: number; kind: keyof typeof COLORS; name: string; n: number; scale: number; marker: CityMarker };
  type PersonEl = { type: "person"; lat: number; lng: number };
  type HtmlItem = Pin | PersonEl;
  // Persona sdraiata: elemento HTML ancorato a lat/lng (segue la rotazione,
  // nascosto sul retro, mai "affettato" dalla sfera come uno sprite 3D).
  const PERSON: PersonEl = { type: "person", lat: 4, lng: -24 };
  const MAX_PINS = 45;
  const items = useMemo<HtmlItem[]>(() => {
    const out: Pin[] = [];
    const maxOpen = Math.max(1, ...markers.map((m) => m.open));
    for (const m of markers) {
      // Un solo pin per città, con priorità: inviate > pronte > aperte.
      if (filters.sent && m.sent > 0) out.push({ type: "pin", lat: m.lat, lng: m.lng, kind: "sent", name: m.name, n: m.sent, scale: 1, marker: m });
      else if (filters.ready && m.ready > 0) out.push({ type: "pin", lat: m.lat, lng: m.lng, kind: "ready", name: m.name, n: m.ready, scale: 0.95, marker: m });
      else if (filters.open && m.open > 0) out.push({ type: "pin", lat: m.lat, lng: m.lng, kind: "open", name: m.name, n: m.open, scale: 0.75 + (m.open / maxOpen) * 0.45, marker: m });
    }
    // Meno affollamento: prima le città con candidature/pronte, poi le più ricche di annunci.
    out.sort((a, b) => (a.kind === "open" ? 0 : 1) - (b.kind === "open" ? 0 : 1) || b.n - a.n);
    const top = out.slice(0, MAX_PINS);
    return [PERSON, ...top];
  }, [markers, filters]);

  const makeEl = (d: object) => {
    const item = d as HtmlItem;
    if (item.type === "person") {
      const el = document.createElement("div");
      el.style.cssText = "width:80px;height:auto;transform:translate(-55%,-42%) rotate(-22deg);pointer-events:none;filter:drop-shadow(0 10px 16px rgba(0,0,0,.5));transition:opacity .25s";
      el.innerHTML = '<img src="/hero-person.png" alt="" draggable="false" style="width:100%;height:auto;display:block;user-select:none" />';
      personElRef.current = el;
      return el;
    }
    const p = item;
    const el = document.createElement("div");
    const sz = Math.round(22 * p.scale);
    el.style.cssText = `width:${sz}px;height:${sz}px;transform:translate(-50%,-100%);cursor:pointer;pointer-events:auto;filter:drop-shadow(0 3px 4px rgba(0,0,0,.55));transition:transform .15s`;
    el.innerHTML = `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}"><path d="M12 22s7-7.1 7-12.5A7 7 0 0 0 5 9.5C5 14.9 12 22 12 22z" fill="${COLORS[p.kind]}" stroke="rgba(255,255,255,.9)" stroke-width="1.4"/><circle cx="12" cy="9.5" r="2.6" fill="#fff"/></svg>`;
    el.title = `${p.name} · ${p.n} ${p.kind === "open" ? "posizioni aperte" : p.kind === "sent" ? "candidature inviate" : "posizioni pronte"} — clicca per il dettaglio`;
    el.onmouseenter = () => { el.style.transform = "translate(-50%,-100%) scale(1.25)"; };
    el.onmouseleave = () => { el.style.transform = "translate(-50%,-100%)"; };
    // Il canvas sotto cattura il drag: fermiamo la propagazione e gestiamo il click qui.
    const stop = (e: Event) => { e.stopPropagation(); };
    el.addEventListener("pointerdown", stop);
    el.addEventListener("mousedown", stop);
    el.addEventListener("touchstart", stop, { passive: true });
    el.addEventListener("click", (e) => { e.stopPropagation(); onSelect?.(p.marker); });
    return el;
  };

  return (
    <div ref={ref} style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 20 }}>
      {width > 0 && height > 0 && (
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
          htmlElementsData={items}
          htmlLat={(d: object) => (d as HtmlItem).lat}
          htmlLng={(d: object) => (d as HtmlItem).lng}
          htmlAltitude={(d: object) => ((d as HtmlItem).type === "person" ? 0.02 : 0.01)}
          htmlElement={makeEl}
          htmlElementVisibilityModifier={(el: HTMLElement, isVisible: boolean) => { el.style.opacity = isVisible ? "1" : "0"; el.style.pointerEvents = isVisible && el.querySelector("svg") ? "auto" : "none"; }}
          htmlTransitionDuration={0}
        />
      )}
    </div>
  );
}
