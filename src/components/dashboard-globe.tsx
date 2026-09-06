"use client";

/**
 * Globo 3D della dashboard utente (react-globe.gl / three.js, WebGL).
 *
 * LIVELLO VISIVO: Terra realistica + persona sdraiata (elemento HTML ancorato
 * a lat/lng, scalato col raggio apparente della Terra).
 * LIVELLO DATI: pin geolocalizzati a 4 stati (aperte / inviate / desiderate /
 * salvate), cluster con conteggio, tooltip in hover, job card flottanti
 * (3-5 di default + quella selezionata). Tutto HTML reale, niente dati
 * "cotti" nell'immagine.
 *
 * Drag = ruota, scroll = zoom limitato, idle = rotazione lentissima che
 * riprende dopo 8s di inattività. SSR disabilitato dal wrapper.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import type { CityMarker, GlobeJob, PinKind } from "@/lib/dashboard-globe-data";
import { PERSON_ANCHOR } from "@/lib/dashboard-globe-data";

export const PIN_COLORS: Record<PinKind, string> = { open: "#2ED69A", sent: "#3B82F6", desired: "#9B5CFF", saved: "#F6B73C" };
export const PIN_LABELS: Record<PinKind, string> = { open: "Opportunità", sent: "Candidatura inviata", desired: "Posizione desiderata", saved: "Salvata" };
export type GlobeFilter = "all" | PinKind;

const KIND_PRIORITY: PinKind[] = ["sent", "saved", "desired", "open"];

export function markerKind(m: CityMarker, filter: GlobeFilter): PinKind | null {
  if (filter !== "all") return m.counts[filter] > 0 ? filter : null;
  return KIND_PRIORITY.find((k) => m.counts[k] > 0) ?? null;
}
export function markerTotal(m: CityMarker, filter: GlobeFilter): number {
  if (filter !== "all") return m.counts[filter];
  return m.counts.open + m.counts.sent + m.counts.desired + m.counts.saved;
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

/** HTML della job card (usata sia sul globo sia nella lista mobile). */
export function jobCardHtml(m: CityMarker, kind: PinKind, opts: { selected?: boolean; compact?: boolean } = {}): string {
  const jobs = m.jobs.filter((j) => j.kind === kind).length ? m.jobs.filter((j) => j.kind === kind) : m.jobs;
  const j: GlobeJob | undefined = jobs[0];
  const color = PIN_COLORS[kind];
  const more = Math.max(0, markerTotal(m, kind === "open" ? "open" : "all") - 1);
  const company = j?.company ?? (kind === "desired" ? "Località desiderata" : "Azienda");
  const cta = kind === "sent" ? "Vedi candidatura" : kind === "saved" ? "Approva e invia" : kind === "desired" ? "Cerca qui" : "Invia candidatura";
  const href = j?.href ?? `/jobs?q=${encodeURIComponent(m.name)}`;
  const match = j?.match != null ? `<span class="dg-chip" style="--c:${PIN_COLORS.open}">${Math.round(j.match)}% match</span>` : "";
  const status = `<span class="dg-chip" style="--c:${color}">${esc(PIN_LABELS[kind])}</span>`;
  const list = more > 0 && jobs.length > 1
    ? `<div class="dg-card-more">${jobs.slice(1, 3).map((x) => `<a href="${esc(x.href)}" class="dg-card-row"><b>${esc(x.company ?? "Azienda")}</b><span>${esc(x.title)}</span></a>`).join("")}${more > 2 ? `<a href="/jobs?q=${encodeURIComponent(m.name)}" class="dg-card-row dg-card-all">e altre ${more - 2} a ${esc(m.name)} →</a>` : ""}</div>`
    : "";
  return `<div class="dg-card${opts.selected ? " is-selected" : ""}${opts.compact ? " is-compact" : ""}" style="--c:${color}">
    <div class="dg-card-head">
      <span class="dg-logo" style="background:hsl(${hue(company)} 45% 22%);color:hsl(${hue(company)} 70% 78%)">${esc(initials(company))}</span>
      <div class="dg-card-txt">
        <div class="dg-card-co">${esc(company)}${m.counts.open + m.counts.sent + m.counts.saved > 1 && !opts.compact ? `<span class="dg-cluster-n">${markerTotal(m, "all")}</span>` : ""}</div>
        <div class="dg-card-role">${esc(j?.title ?? (kind === "desired" ? "Le opportunità qui vengono cercate per te" : "Nessun annuncio"))}</div>
        <div class="dg-card-loc">${esc(m.name)}${m.country ? `, ${esc(m.country)}` : ""}</div>
      </div>
    </div>
    <div class="dg-card-chips">${match}${status}</div>
    ${list}
    <a href="${esc(href)}" class="dg-card-cta">${cta} <span aria-hidden="true">→</span></a>
  </div>`;
}

export function DashboardGlobe({
  markers, filter, featuredKeys, selectedKey, onSelect,
}: {
  markers: CityMarker[];
  filter: GlobeFilter;
  featuredKeys: string[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const personElRef = useRef<HTMLDivElement | null>(null);
  const width = size.w;
  const height = size.h;
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

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
    c.autoRotate = !reducedMotion;
    c.autoRotateSpeed = 0.35;
    c.enableZoom = true;
    c.enablePan = false;
    c.zoomSpeed = 0.5;
    // Il globo è dimensionato sull'altezza: su viewport stretti (mobile)
    // alziamo la camera perché la Terra stia dentro la larghezza.
    const alt = width < height ? Math.min(3.2, 1.4 * (height / width) * 1.15) : 1.4;
    c.minDistance = Math.min(225, 100 * (1 + alt));
    c.maxDistance = Math.max(320, 100 * (1 + alt) + 60);
    let resume: ReturnType<typeof setTimeout> | undefined;
    const stop = () => { c.autoRotate = false; if (resume) clearTimeout(resume); };
    const end = () => { if (resume) clearTimeout(resume); if (!reducedMotion) resume = setTimeout(() => { c.autoRotate = true; }, 8000); };
    c.addEventListener("start", stop);
    c.addEventListener("end", end);
    // La persona è un elemento HTML (px): la scaliamo col raggio apparente del
    // globo (~metà del raggio, come nel riferimento) a qualsiasi zoom.
    const cam = g.camera() as { position: { length: () => number }; fov?: number };
    const fitPerson = () => {
      const el = personElRef.current;
      if (!el || !height) return;
      const dist = cam.position.length();
      const fov = ((cam.fov ?? 50) * Math.PI) / 180;
      const radiusPx = (100 / dist) * (height / 2) / Math.tan(fov / 2);
      el.style.width = `${Math.max(40, Math.min(220, radiusPx * 0.5))}px`;
    };
    // Le card si aprono verso l'ESTERNO del globo (lato in cui si trova il
    // pin rispetto al centro), ricalcolato mentre la Terra ruota.
    const root = ref.current;
    const placeCards = () => {
      if (!root) return;
      const rb = root.getBoundingClientRect();
      const mid = rb.left + root.clientWidth / 2;
      root.querySelectorAll<HTMLElement>(".dg-pin.has-card").forEach((pin) => {
        const r = pin.getBoundingClientRect();
        const y = r.top - rb.top;
        pin.classList.toggle("side-r", r.left >= mid);
        pin.classList.toggle("side-l", r.left < mid);
        // Vicino al bordo alto/basso la card si estende verso l'interno
        // invece di uscire dall'hero (o finire sotto i filtri).
        pin.classList.toggle("edge-top", y < 150);
        pin.classList.toggle("edge-bottom", y > root.clientHeight - 130);
      });
    };
    const onChange = () => { fitPerson(); placeCards(); };
    onChange();
    c.addEventListener("change", onChange);
    const t = setInterval(onChange, 400);
    g.pointOfView({ lat: 22, lng: 5, altitude: alt }, 0);
    return () => { c.removeEventListener("start", stop); c.removeEventListener("end", end); c.removeEventListener("change", onChange); clearInterval(t); if (resume) clearTimeout(resume); };
  }, [width, height, reducedMotion]);

  type Item = { type: "person"; lat: number; lng: number } | { type: "pin"; lat: number; lng: number; m: CityMarker; kind: PinKind; card: boolean; selected: boolean };
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [{ type: "person", ...PERSON_ANCHOR }];
    for (const m of markers) {
      const kind = markerKind(m, filter);
      if (!kind) continue; // marker non visibile col filtro → non renderizzato
      const selected = m.key === selectedKey;
      out.push({ type: "pin", lat: m.lat, lng: m.lng, m, kind, selected, card: selected || (selectedKey == null && featuredKeys.includes(m.key)) });
    }
    return out;
  }, [markers, filter, featuredKeys, selectedKey]);

  const makeEl = (d: object) => {
    const item = d as Item;
    if (item.type === "person") {
      const el = document.createElement("div");
      el.className = "dg-person";
      el.innerHTML = '<img src="/hero-person.png" alt="" draggable="false" />';
      personElRef.current = el;
      return el;
    }
    const { m, kind, card, selected } = item;
    const color = PIN_COLORS[kind];
    const total = markerTotal(m, filter);
    const el = document.createElement("div");
    el.className = `dg-pin${m.isNew && !reducedMotion ? " is-new" : ""}${selected ? " is-selected" : ""}${card ? " has-card" : ""}`;
    el.style.setProperty("--c", color);
    const j = m.jobs.find((x) => x.kind === kind) ?? m.jobs[0];
    const tip = j
      ? `<b>${esc(j.company ?? m.name)}</b><span>${esc(j.title)}</span>${j.match != null ? `<em>${Math.round(j.match)}% match</em>` : ""}`
      : `<b>${esc(m.name)}</b><span>${esc(PIN_LABELS[kind])}</span>`;
    el.innerHTML = `
      <div class="dg-pin-body" role="button" tabindex="0" aria-label="${esc(m.name)}: ${total} ${esc(PIN_LABELS[kind].toLowerCase())}">
        <span class="dg-pin-glow"></span>
        <svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 22s7-7.1 7-12.5A7 7 0 0 0 5 9.5C5 14.9 12 22 12 22z" fill="${color}" stroke="rgba(255,255,255,.85)" stroke-width="1.3"/><circle cx="12" cy="9.5" r="2.7" fill="#fff"/></svg>
        ${total > 1 ? `<span class="dg-pin-count">${total}</span>` : ""}
        <div class="dg-tip">${tip}</div>
      </div>
      ${card ? `<div class="dg-card-anchor">${jobCardHtml(m, kind, { selected })}</div>` : ""}`;
    // Il canvas sotto cattura il drag: qui fermiamo la propagazione e gestiamo il click.
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener("pointerdown", stop);
    el.addEventListener("mousedown", stop);
    el.addEventListener("touchstart", stop, { passive: true });
    el.addEventListener("wheel", stop, { passive: true });
    const body = el.querySelector(".dg-pin-body") as HTMLElement;
    body.addEventListener("click", (e) => { e.stopPropagation(); onSelect(selected ? null : m.key); });
    body.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(selected ? null : m.key); } });
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
          atmosphereColor="#6fb7ff"
          atmosphereAltitude={0.18}
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
          bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
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
