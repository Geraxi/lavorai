"use client";

/**
 * Globo 3D della dashboard utente (react-globe.gl / three.js, WebGL).
 * Pin per città: posizioni aperte (verde), candidature inviate (blu),
 * posizioni pronte da inviare (giallo). Drag per ruotare, scroll per zoom,
 * hover per il dettaglio. SSR disabilitato dal wrapper (dynamic ssr:false).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import * as THREE from "three";

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


export function DashboardGlobe({ markers, filters }: { markers: CityMarker[]; filters: GlobeFilters; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState({ w: 0, h: 0 });
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
    g.pointOfView({ lat: 38, lng: 8, altitude: 1.9 }, 0);
    return () => c.removeEventListener("start", stop);
  }, [width, height]);

  // Persona sdraiata: sprite (sempre rivolta alla camera) ancorata a lat/lng:
  // ruota con la Terra, viene occlusa quando passa sul retro e non si
  // "appiattisce" di taglio come farebbe un piano tangente.
  const PERSON = { lat: 4, lng: -24 };
  const personObj = useMemo(() => {
    const W = 15; // raggio globo = 100 unità
    const H = W * (399 / 215);
    const tex = new THREE.TextureLoader().load("/hero-person.png");
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(W, H, 1);
    sprite.material.rotation = -0.25;
    return sprite;
  }, []);

  type Pin = { lat: number; lng: number; kind: keyof typeof COLORS; name: string; n: number; scale: number };
  const pins = useMemo(() => {
    const out: Pin[] = [];
    const maxOpen = Math.max(1, ...markers.map((m) => m.open));
    for (const m of markers) {
      // Un solo pin per città, con priorità: inviate > pronte > aperte.
      if (filters.sent && m.sent > 0) out.push({ lat: m.lat, lng: m.lng, kind: "sent", name: m.name, n: m.sent, scale: 1 });
      else if (filters.ready && m.ready > 0) out.push({ lat: m.lat, lng: m.lng, kind: "ready", name: m.name, n: m.ready, scale: 0.95 });
      else if (filters.open && m.open > 0) out.push({ lat: m.lat, lng: m.lng, kind: "open", name: m.name, n: m.open, scale: 0.75 + (m.open / maxOpen) * 0.45 });
    }
    return out;
  }, [markers, filters]);

  const makePin = (d: object) => {
    const p = d as Pin;
    const el = document.createElement("div");
    const sz = Math.round(22 * p.scale);
    el.style.cssText = `width:${sz}px;height:${sz}px;transform:translate(-50%,-100%);cursor:pointer;pointer-events:auto;filter:drop-shadow(0 3px 4px rgba(0,0,0,.55));transition:transform .15s`;
    el.innerHTML = `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}"><path d="M12 22s7-7.1 7-12.5A7 7 0 0 0 5 9.5C5 14.9 12 22 12 22z" fill="${COLORS[p.kind]}" stroke="rgba(255,255,255,.9)" stroke-width="1.4"/><circle cx="12" cy="9.5" r="2.6" fill="#fff"/></svg>`;
    el.title = `${p.name} · ${p.n} ${p.kind === "open" ? "posizioni aperte" : p.kind === "sent" ? "candidature inviate" : "posizioni pronte"}`;
    el.onmouseenter = () => { el.style.transform = "translate(-50%,-100%) scale(1.25)"; };
    el.onmouseleave = () => { el.style.transform = "translate(-50%,-100%)"; };
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
          htmlElementsData={pins}
          htmlLat={(d: object) => (d as Pin).lat}
          htmlLng={(d: object) => (d as Pin).lng}
          htmlAltitude={0.01}
          htmlElement={makePin}
          htmlElementVisibilityModifier={(el: HTMLElement, isVisible: boolean) => { el.style.opacity = isVisible ? "1" : "0"; el.style.pointerEvents = isVisible ? "auto" : "none"; }}
          htmlTransitionDuration={0}
          objectsData={[PERSON]}
          objectLat={(d: object) => (d as { lat: number }).lat}
          objectLng={(d: object) => (d as { lng: number }).lng}
          objectAltitude={0.012}
          objectThreeObject={() => personObj}
        />
      )}
    </div>
  );
}
