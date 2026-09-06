"use client";

/**
 * Globo hero della dashboard utente (react-globe.gl / three.js, WebGL).
 *
 * LIVELLO VISIVO: Terra realistica (blue marble + rilievo + strato nuvole in
 * lenta deriva), luce ambientale piena + luce direzionale in alto a destra,
 * atmosfera blu. Persona sdraiata = elemento HTML ancorato a lat/lng, scalata
 * col raggio apparente della Terra. Drag = ruota, scroll = zoom limitato,
 * idle = rotazione lentissima che riprende dopo 8s.
 * LIVELLO DATI (HTML reale): pin a 4 stati per città con cluster angolare,
 * tooltip in hover, max 3 job card compatte di default + quella selezionata,
 * "N opportunità" apre lo sheet della città.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import { AmbientLight, DirectionalLight, Mesh, MeshPhongMaterial, SphereGeometry, TextureLoader } from "three";
import type { CityMarker, GlobeJob, PinKind } from "@/lib/dashboard-globe-data";
import { angularDistance } from "@/lib/dashboard-globe-data";

export const PIN_COLORS: Record<PinKind, string> = { open: "#2ED69A", sent: "#3B82F6", desired: "#9B5CFF", saved: "#F6B73C" };
export const PIN_LABELS: Record<PinKind, string> = { open: "Opportunità", sent: "Inviata", desired: "Desiderata", saved: "Salvata" };
export type GlobeFilter = "all" | PinKind;

const KIND_PRIORITY: PinKind[] = ["sent", "saved", "desired", "open"];
/** Punto in cui è ancorata la persona sdraiata (Atlantico, tra Americhe e Africa). */
const PERSON = { lat: 6, lng: -26 };

export function markerKind(m: CityMarker, filter: GlobeFilter): PinKind | null {
  if (filter !== "all") return m.counts[filter] > 0 ? filter : null;
  return KIND_PRIORITY.find((k) => m.counts[k] > 0) ?? null;
}
export function markerTotal(m: CityMarker, filter: GlobeFilter): number {
  if (filter !== "all") return m.counts[filter];
  return m.counts.open + m.counts.sent + m.counts.desired + m.counts.saved;
}

/** Pin sulla mappa: una città o un cluster di città vicine. */
export interface GlobePin {
  key: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  kind: PinKind;
  total: number;
  isNew: boolean;
  cities: CityMarker[];
  job: GlobeJob | null;
}

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
function initials(company: string | null): string {
  const w = (company ?? "?").trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "?") + (w[1]?.[0] ?? "")).toUpperCase();
}
function hue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Raggruppa le città visibili col filtro in pin, unendo quelle entro `mergeDeg` gradi. */
export function buildPins(markers: CityMarker[], filter: GlobeFilter, mergeDeg = 4.5): GlobePin[] {
  const rows = markers
    .map((m) => ({ m, kind: markerKind(m, filter) }))
    .filter((r): r is { m: CityMarker; kind: PinKind } => r.kind != null)
    .sort((a, b) => markerTotal(b.m, filter) - markerTotal(a.m, filter));
  const pins: GlobePin[] = [];
  for (const r of rows) {
    const near = pins.find((p) => angularDistance(p.lat, p.lng, r.m.lat, r.m.lng) < mergeDeg);
    if (near) {
      near.cities.push(r.m);
      near.total += markerTotal(r.m, filter);
      near.isNew = near.isNew || r.m.isNew;
      if (KIND_PRIORITY.indexOf(r.kind) < KIND_PRIORITY.indexOf(near.kind)) { near.kind = r.kind; near.job = r.m.jobs.find((j) => j.kind === r.kind) ?? near.job; }
      continue;
    }
    pins.push({ key: r.m.key, name: r.m.name, country: r.m.country, lat: r.m.lat, lng: r.m.lng, kind: r.kind, total: markerTotal(r.m, filter), isNew: r.m.isNew, cities: [r.m], job: r.m.jobs.find((j) => j.kind === r.kind) ?? r.m.jobs[0] ?? null });
  }
  return pins;
}

/** Card visibili di default: 3 pin rilevanti, distanti tra loro e lontani dalla persona. */
export function pickFeatured(pins: GlobePin[], visible: (p: GlobePin) => boolean, screen?: (p: GlobePin) => { x: number; y: number }): string[] {
  const score = (p: GlobePin) => p.cities.reduce((s, c) => s + c.counts.sent * 100 + c.counts.saved * 60 + c.counts.desired * 40 + (c.jobs[0]?.match ?? 0), 0) + Math.min(p.total, 20);
  const out: GlobePin[] = [];
  for (const p of [...pins].sort((a, b) => score(b) - score(a))) {
    if (out.length >= 3) break;
    if (!p.job || !visible(p)) continue;
    if (angularDistance(p.lat, p.lng, PERSON.lat, PERSON.lng) < 42) continue;
    if (out.some((o) => angularDistance(o.lat, o.lng, p.lat, p.lng) < 20)) continue;
    // Le card sono larghe ~270px: due pin vicini sullo schermo si coprirebbero.
    if (screen && out.some((o) => { const a = screen(o), b = screen(p); return Math.abs(a.x - b.x) < 600 && Math.abs(a.y - b.y) < 200; })) continue;
    out.push(p);
  }
  return out.map((p) => p.key);
}

function cardCopy(pin: GlobePin) {
  const j = pin.job;
  return {
    company: j?.company ?? (pin.kind === "desired" ? "Località desiderata" : "Azienda"),
    role: j?.title ?? (pin.kind === "desired" ? "Cerchiamo opportunità qui" : "Nessun annuncio"),
    cta: pin.kind === "sent" ? "Vedi candidatura" : pin.kind === "saved" ? "Approva e invia" : pin.kind === "desired" ? "Cerca qui" : "Invia candidatura",
    href: j?.href ?? `/jobs?q=${encodeURIComponent(pin.name)}`,
  };
}

/** Job card React (mobile / liste). */
export function JobCard({ pin, selected, compact, onMore }: { pin: GlobePin; selected?: boolean; compact?: boolean; onMore?: (pin: GlobePin) => void }) {
  const { company, role, cta, href } = cardCopy(pin);
  const color = PIN_COLORS[pin.kind];
  return (
    <div className={`dg-card${selected ? " is-selected" : ""}${compact ? " is-compact" : ""}`} style={{ ["--c" as string]: color }}>
      <div className="dg-card-head">
        <span className="dg-logo" style={{ background: `hsl(${hue(company)} 45% 22%)`, color: `hsl(${hue(company)} 70% 78%)` }}>{initials(company)}</span>
        <div className="dg-card-txt">
          <div className="dg-card-co">{company}</div>
          <div className="dg-card-role">{role}</div>
          <div className="dg-card-loc">{pin.name}{pin.country ? `, ${pin.country}` : ""}</div>
        </div>
      </div>
      <div className="dg-card-chips">
        <span className="dg-chip" style={{ ["--c" as string]: color }}>{PIN_LABELS[pin.kind]}</span>
        {pin.job?.match != null && <span className="dg-chip" style={{ ["--c" as string]: PIN_COLORS.open }}>{Math.round(pin.job.match)}% match</span>}
      </div>
      {pin.total > 1 && <button type="button" className="dg-card-more" onClick={(e) => { e.stopPropagation(); onMore?.(pin); }}>{pin.name} · {pin.total} opportunità →</button>}
      <a href={href} className="dg-card-cta" onClick={(e) => e.stopPropagation()}>{cta} <span aria-hidden="true">→</span></a>
    </div>
  );
}

/** Stessa card in HTML (per il layer HTML di three.js). */
function jobCardHtml(pin: GlobePin, selected: boolean): string {
  const { company, role, cta, href } = cardCopy(pin);
  const color = PIN_COLORS[pin.kind];
  return `<div class="dg-card${selected ? " is-selected" : ""}" style="--c:${color}">
    <div class="dg-card-head">
      <span class="dg-logo" style="background:hsl(${hue(company)} 45% 22%);color:hsl(${hue(company)} 70% 78%)">${esc(initials(company))}</span>
      <div class="dg-card-txt"><div class="dg-card-co">${esc(company)}</div><div class="dg-card-role">${esc(role)}</div><div class="dg-card-loc">${esc(pin.name)}${pin.country ? `, ${esc(pin.country)}` : ""}</div></div>
    </div>
    <div class="dg-card-chips"><span class="dg-chip" style="--c:${color}">${esc(PIN_LABELS[pin.kind])}</span>${pin.job?.match != null ? `<span class="dg-chip" style="--c:${PIN_COLORS.open}">${Math.round(pin.job.match)}% match</span>` : ""}</div>
    ${pin.total > 1 ? `<button type="button" class="dg-card-more" data-more="1">${esc(pin.name)} · ${pin.total} opportunità →</button>` : ""}
    <a href="${esc(href)}" class="dg-card-cta">${cta} <span aria-hidden="true">→</span></a>
  </div>`;
}

export function DashboardGlobe({
  markers, filter, selectedKey, onSelect, onMore,
}: {
  markers: CityMarker[];
  filter: GlobeFilter;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  onMore: (pin: GlobePin) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const personElRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState(0); // incrementa a fine interazione → ricalcolo card in vista
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const { w: width, h: height } = size;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // Setup scena: luci, nuvole, controlli, persona, posizionamento card.
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !height) return;
    const c = g.controls();
    c.autoRotate = !reducedMotion;
    c.autoRotateSpeed = 0.3;
    c.enableZoom = true;
    c.enablePan = false;
    c.zoomSpeed = 0.5;
    // Il globo riempie l'hero: raggio ≈ 46% dell'altezza; zoom tra 42% e 52%.
    const portrait = width < height;
    const alt = portrait ? Math.min(3.2, 1.33 * (height / width) * 1.15) : 1.33;
    c.minDistance = portrait ? 100 * (1 + alt) : 218;
    c.maxDistance = portrait ? 100 * (1 + alt) + 60 : 260;
    g.pointOfView({ lat: 18, lng: -4, altitude: alt }, 0);

    // Luci cinematiche: ambiente pieno (niente lato notte) + chiave in alto a destra.
    const key = new DirectionalLight(0xffffff, 1.6);
    key.position.set(1.2, 0.9, 1.4);
    g.lights([new AmbientLight(0xffffff, 1.35), key]);

    // Strato nuvole in lenta deriva.
    let clouds: Mesh | null = null;
    let raf = 0;
    new TextureLoader().load("/textures/clouds.webp", (tex) => {
      clouds = new Mesh(new SphereGeometry(g.getGlobeRadius() * 1.012, 64, 64), new MeshPhongMaterial({ map: tex, transparent: true, opacity: 0.72, depthWrite: false }));
      g.scene().add(clouds);
      const spin = () => { if (clouds && !reducedMotion) clouds.rotation.y += 0.00035; raf = requestAnimationFrame(spin); };
      spin();
    });

    let resume: ReturnType<typeof setTimeout> | undefined;
    const stop = () => { c.autoRotate = false; if (resume) clearTimeout(resume); };
    const end = () => { setView((v) => v + 1); if (resume) clearTimeout(resume); if (!reducedMotion) resume = setTimeout(() => { c.autoRotate = true; }, 8000); };
    c.addEventListener("start", stop);
    c.addEventListener("end", end);

    const cam = g.camera() as { position: { length: () => number }; fov?: number };
    const radiusPx = () => { const fov = ((cam.fov ?? 50) * Math.PI) / 180; return (100 / cam.position.length()) * (height / 2) / Math.tan(fov / 2); };
    const root = ref.current;
    const tick = () => {
      // Persona ≈ 42% del raggio in larghezza (≈ 40% del diametro in lunghezza).
      const el = personElRef.current;
      if (el) el.style.width = `${Math.max(48, Math.min(360, radiusPx() * 0.42))}px`;
      // Card verso l'esterno del globo, ma mai fuori dall'hero.
      if (!root) return;
      const rb = root.getBoundingClientRect();
      root.querySelectorAll<HTMLElement>(".dg-pin.has-card").forEach((pin) => {
        const r = pin.getBoundingClientRect();
        const x = r.left - rb.left, y = r.top - rb.top;
        // Ai bordi laterali la card scende sotto il pin (verso l'interno) invece
        // di uscire dall'hero o coprire il centro del globo.
        const edgeL = x < 320, edgeR = x > root.clientWidth - 320;
        const sideR = !edgeL && !edgeR && x >= root.clientWidth / 2;
        pin.classList.toggle("edge-side-l", edgeL);
        pin.classList.toggle("edge-side-r", edgeR);
        pin.classList.toggle("side-r", !edgeL && !edgeR && sideR);
        pin.classList.toggle("side-l", !edgeL && !edgeR && !sideR);
        pin.classList.toggle("edge-top", y < 200);
        pin.classList.toggle("edge-bottom", y > root.clientHeight - 200);
      });
    };
    tick();
    c.addEventListener("change", tick);
    const t = setInterval(tick, 400);
    // Prima passata delle card quando il globo è pronto.
    const first = setTimeout(() => setView((v) => v + 1), 300);
    return () => {
      c.removeEventListener("start", stop); c.removeEventListener("end", end); c.removeEventListener("change", tick);
      clearInterval(t); clearTimeout(first); if (resume) clearTimeout(resume); cancelAnimationFrame(raf);
      if (clouds) g.scene().remove(clouds);
    };
  }, [width, height, reducedMotion]);

  // Cluster: ~30px alla scala attuale.
  const pins = useMemo(() => {
    const g = globeRef.current;
    let mergeDeg = 4.5;
    if (g && height) {
      const cam = g.camera() as { position: { length: () => number }; fov?: number };
      const fov = ((cam.fov ?? 50) * Math.PI) / 180;
      const r = (100 / cam.position.length()) * (height / 2) / Math.tan(fov / 2);
      mergeDeg = Math.max(2, Math.min(8, 30 / ((r * Math.PI) / 180)));
    }
    return buildPins(markers, filter, mergeDeg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, filter, height, view]);

  const featured = useMemo(() => {
    const g = globeRef.current;
    const visible = (p: GlobePin) => {
      if (!g || !width) return true;
      const s = g.getScreenCoords(p.lat, p.lng, 0.01);
      // Fuori dalle zone del saluto/stato (alto-sinistra) e dei filtri (alto).
      if (s.y < 110) return false;
      if (s.x < 420 && s.y < 250) return false;
      const pov = g.pointOfView();
      return angularDistance(pov.lat, pov.lng, p.lat, p.lng) < 62;
    };
    const screen = (p: GlobePin) => { if (!g) return { x: 0, y: 0 }; const s = g.getScreenCoords(p.lat, p.lng, 0.01); return { x: s.x, y: s.y }; };
    return pickFeatured(pins, visible, screen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, view, width]);

  type Item = { type: "person"; lat: number; lng: number } | { type: "pin"; lat: number; lng: number; pin: GlobePin; card: boolean; selected: boolean };
  const items = useMemo<Item[]>(() => [
    { type: "person", ...PERSON },
    ...pins.map((p): Item => { const selected = p.key === selectedKey; return { type: "pin", lat: p.lat, lng: p.lng, pin: p, selected, card: selected || (selectedKey == null && featured.includes(p.key)) }; }),
  ], [pins, featured, selectedKey]);

  const makeEl = (d: object) => {
    const item = d as Item;
    if (item.type === "person") {
      const el = document.createElement("div");
      el.className = "dg-person";
      el.innerHTML = '<img src="/hero-person.png" alt="" draggable="false" />';
      personElRef.current = el;
      return el;
    }
    const { pin: p, card, selected } = item;
    const color = PIN_COLORS[p.kind];
    const el = document.createElement("div");
    el.className = `dg-pin${p.isNew && !reducedMotion ? " is-new" : ""}${selected ? " is-selected" : ""}${card ? " has-card" : ""}`;
    el.style.setProperty("--c", color);
    const tip = p.job
      ? `<b>${esc(p.job.company ?? p.name)}</b><span>${esc(p.job.title)}</span>${p.job.match != null ? `<em>${Math.round(p.job.match)}% match</em>` : ""}`
      : `<b>${esc(p.name)}</b><span>${esc(PIN_LABELS[p.kind])}</span>`;
    el.innerHTML = `
      <div class="dg-pin-body" role="button" tabindex="0" aria-label="${esc(p.name)}: ${p.total} ${esc(PIN_LABELS[p.kind].toLowerCase())}">
        <span class="dg-pin-glow"></span>
        <svg viewBox="0 0 24 24" width="28" height="28"><path d="M12 22s7-7.1 7-12.5A7 7 0 0 0 5 9.5C5 14.9 12 22 12 22z" fill="${color}" stroke="rgba(255,255,255,.85)" stroke-width="1.3"/><circle cx="12" cy="9.5" r="2.7" fill="#fff"/></svg>
        ${p.total > 1 ? `<span class="dg-pin-count">${p.total}</span>` : ""}
        ${card ? "" : `<div class="dg-tip">${tip}</div>`}
      </div>
      ${card ? `<div class="dg-card-anchor">${jobCardHtml(p, selected)}</div>` : ""}`;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener("pointerdown", stop);
    el.addEventListener("mousedown", stop);
    el.addEventListener("touchstart", stop, { passive: true });
    el.addEventListener("wheel", stop, { passive: true });
    const body = el.querySelector(".dg-pin-body") as HTMLElement;
    body.addEventListener("click", (e) => { e.stopPropagation(); onSelect(selected ? null : p.key); });
    body.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(selected ? null : p.key); } });
    el.querySelector("[data-more]")?.addEventListener("click", (e) => { e.stopPropagation(); onMore(p); });
    el.querySelector(".dg-card")?.addEventListener("click", (e) => e.stopPropagation());
    return el;
  };

  return (
    <div ref={ref} className="dg-globe" onClick={() => onSelect(null)}>
      {width > 0 && height > 0 && (
        <Globe
          ref={globeRef}
          width={width}
          height={height}
          backgroundColor="rgba(0,0,0,0)"
          showAtmosphere
          atmosphereColor="#7fc3ff"
          atmosphereAltitude={0.2}
          globeImageUrl="/textures/earth-blue-marble.jpg"
          bumpImageUrl="/textures/earth-topology.png"
          htmlElementsData={items}
          htmlLat={(d: object) => (d as Item).lat}
          htmlLng={(d: object) => (d as Item).lng}
          htmlAltitude={(d: object) => ((d as Item).type === "person" ? 0.02 : 0.012)}
          htmlElement={makeEl}
          htmlElementVisibilityModifier={(el: HTMLElement, isVisible: boolean) => {
            el.style.opacity = isVisible ? "1" : "0";
            el.style.pointerEvents = isVisible && el.classList.contains("dg-pin") ? "auto" : "none";
          }}
          htmlTransitionDuration={0}
        />
      )}
    </div>
  );
}
