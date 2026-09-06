"use client";

/**
 * Globo hero della dashboard utente.
 *
 * LIVELLO VISIVO: immagine ad alta risoluzione (Terra realistica con nuvole +
 * persona sdraiata), scelta per fedeltà al riferimento invece del WebGL.
 * LIVELLO DATI (HTML reale): pin geolocalizzati a 4 stati proiettati sulla
 * stessa immagine (vedi globe-projection.ts), cluster per vicinanza in pixel,
 * tooltip in hover, max 3 job card di default + quella selezionata.
 * Parallasse leggera al mouse per profondità; prefers-reduced-motion rispettato.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CityMarker, GlobeJob, PinKind } from "@/lib/dashboard-globe-data";
import { projectToGlobe, GLOBE_CENTER, PERSON_BOX } from "@/lib/globe-projection";

export const PIN_COLORS: Record<PinKind, string> = { open: "#2ED69A", sent: "#3B82F6", desired: "#9B5CFF", saved: "#F6B73C" };
export const PIN_LABELS: Record<PinKind, string> = { open: "Opportunità", sent: "Inviata", desired: "Desiderata", saved: "Salvata" };
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

/** Pin sulla mappa: una città o un cluster di città vicine. */
export interface GlobePin {
  key: string;
  name: string;
  country: string;
  x: number; // frazione immagine
  y: number;
  kind: PinKind;
  total: number;
  isNew: boolean;
  cities: CityMarker[];
  job: GlobeJob | null;
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

/** Raggruppa le città visibili col filtro in pin, unendo quelle entro `mergePx`. */
export function buildPins(markers: CityMarker[], filter: GlobeFilter, sizePx: number, mergePx = 30): GlobePin[] {
  const pts = markers
    .map((m) => ({ m, kind: markerKind(m, filter), p: projectToGlobe(m.lat, m.lng) }))
    .filter((r): r is { m: CityMarker; kind: PinKind; p: ReturnType<typeof projectToGlobe> } => r.kind != null && r.p.visible)
    .sort((a, b) => markerTotal(b.m, filter) - markerTotal(a.m, filter));
  const pins: GlobePin[] = [];
  for (const r of pts) {
    const near = pins.find((p) => Math.hypot((p.x - r.p.x) * sizePx, (p.y - r.p.y) * sizePx) < mergePx);
    if (near) {
      near.cities.push(r.m);
      near.total += markerTotal(r.m, filter);
      near.isNew = near.isNew || r.m.isNew;
      if (KIND_PRIORITY.indexOf(r.kind) < KIND_PRIORITY.indexOf(near.kind)) near.kind = r.kind;
      continue;
    }
    const job = r.m.jobs.find((j) => j.kind === r.kind) ?? r.m.jobs[0] ?? null;
    pins.push({ key: r.m.key, name: r.m.name, country: r.m.country, x: r.p.x, y: r.p.y, kind: r.kind, total: markerTotal(r.m, filter), isNew: r.m.isNew, cities: [r.m], job });
  }
  return pins;
}

/** Card visibili di default: 3 pin rilevanti, distanti tra loro e fuori dalla persona. */
export function pickFeatured(pins: GlobePin[], sizePx: number): string[] {
  const score = (p: GlobePin) => p.cities.reduce((s, c) => s + c.counts.sent * 100 + c.counts.saved * 60 + c.counts.desired * 40 + (c.jobs[0]?.match ?? 0), 0) + Math.min(p.total, 20);
  const out: GlobePin[] = [];
  for (const p of [...pins].sort((a, b) => score(b) - score(a))) {
    if (out.length >= 3) break;
    if (!p.job) continue;
    if (p.x > PERSON_BOX.x0 - 0.06 && p.x < PERSON_BOX.x1 + 0.06 && p.y > PERSON_BOX.y0 - 0.06 && p.y < PERSON_BOX.y1 + 0.06) continue;
    if (out.some((o) => Math.hypot((o.x - p.x) * sizePx, (o.y - p.y) * sizePx) < 260)) continue;
    out.push(p);
  }
  return out.map((p) => p.key);
}

export function JobCard({ pin, selected, compact, onMore }: { pin: GlobePin; selected?: boolean; compact?: boolean; onMore?: (pin: GlobePin) => void }) {
  const j = pin.job;
  const color = PIN_COLORS[pin.kind];
  const company = j?.company ?? (pin.kind === "desired" ? "Località desiderata" : "Azienda");
  const cta = pin.kind === "sent" ? "Vedi candidatura" : pin.kind === "saved" ? "Approva e invia" : pin.kind === "desired" ? "Cerca qui" : "Invia candidatura";
  const href = j?.href ?? `/jobs?q=${encodeURIComponent(pin.name)}`;
  return (
    <div className={`dg-card${selected ? " is-selected" : ""}${compact ? " is-compact" : ""}`} style={{ ["--c" as string]: color }}>
      <div className="dg-card-head">
        <span className="dg-logo" style={{ background: `hsl(${hue(company)} 45% 22%)`, color: `hsl(${hue(company)} 70% 78%)` }}>{initials(company)}</span>
        <div className="dg-card-txt">
          <div className="dg-card-co">{company}</div>
          <div className="dg-card-role">{j?.title ?? (pin.kind === "desired" ? "Cerchiamo opportunità qui" : "Nessun annuncio")}</div>
          <div className="dg-card-loc">{pin.name}{pin.country ? `, ${pin.country}` : ""}</div>
        </div>
      </div>
      <div className="dg-card-chips">
        <span className="dg-chip" style={{ ["--c" as string]: color }}>{PIN_LABELS[pin.kind]}</span>
        {j?.match != null && <span className="dg-chip" style={{ ["--c" as string]: PIN_COLORS.open }}>{Math.round(j.match)}% match</span>}
      </div>
      {pin.total > 1 && (
        <button type="button" className="dg-card-more" onClick={(e) => { e.stopPropagation(); onMore?.(pin); }}>
          {pin.name} · {pin.total} opportunità →
        </button>
      )}
      <a href={href} className="dg-card-cta" onClick={(e) => e.stopPropagation()}>{cta} <span aria-hidden="true">→</span></a>
    </div>
  );
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
  const [size, setSize] = useState(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize(el.clientWidth);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const pins = useMemo(() => buildPins(markers, filter, size || 800), [markers, filter, size]);
  const featured = useMemo(() => pickFeatured(pins, size || 800), [pins, size]);

  const onMove = (e: React.MouseEvent) => {
    if (reducedMotion || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setTilt({ x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: ((e.clientY - r.top) / r.height - 0.5) * 2 });
  };

  return (
    <div
      ref={ref}
      className="dg-globe"
      onMouseMove={onMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      onClick={() => onSelect(null)}
      style={{ transform: `perspective(1400px) rotateY(${tilt.x * 3}deg) rotateX(${-tilt.y * 3}deg)` }}
    >
      <img src="/hero-globe.webp" alt="" className="dg-earth" draggable={false} />
      {pins.map((p) => {
        const selected = p.key === selectedKey;
        const card = selected || (selectedKey == null && featured.includes(p.key));
        const sideR = p.x >= GLOBE_CENTER.x;
        const edgeTop = p.y < 0.16;
        const edgeBottom = p.y > 0.86;
        const color = PIN_COLORS[p.kind];
        return (
          <div
            key={p.key}
            className={`dg-pin${p.isNew && !reducedMotion ? " is-new" : ""}${selected ? " is-selected" : ""}${card ? " has-card" : ""} ${sideR ? "side-r" : "side-l"}${edgeTop ? " edge-top" : ""}${edgeBottom ? " edge-bottom" : ""}`}
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, ["--c" as string]: color }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="dg-pin-body"
              aria-label={`${p.name}: ${p.total} ${PIN_LABELS[p.kind].toLowerCase()}`}
              onClick={() => onSelect(selected ? null : p.key)}
            >
              <span className="dg-pin-glow" />
              <svg viewBox="0 0 24 24" width="28" height="28"><path d="M12 22s7-7.1 7-12.5A7 7 0 0 0 5 9.5C5 14.9 12 22 12 22z" fill={color} stroke="rgba(255,255,255,.85)" strokeWidth="1.3" /><circle cx="12" cy="9.5" r="2.7" fill="#fff" /></svg>
              {p.total > 1 && <span className="dg-pin-count">{p.total}</span>}
              {!card && (
                <span className="dg-tip">
                  <b>{p.job?.company ?? p.name}</b>
                  <span>{p.job?.title ?? PIN_LABELS[p.kind]}</span>
                  {p.job?.match != null && <em>{Math.round(p.job.match)}% match</em>}
                </span>
              )}
            </button>
            {card && <div className="dg-card-anchor"><JobCard pin={p} selected={selected} onMore={onMore} /></div>}
          </div>
        );
      })}
    </div>
  );
}
