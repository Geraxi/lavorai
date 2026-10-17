"use client";

/**
 * Parti leggere del globo dashboard (colori, clustering dei pin, job card).
 *
 * Vivono qui, separate da dashboard-globe.tsx, perché quel file importa
 * react-globe.gl + three (~1 MB di JS, accede a `window` al load). Chi ha
 * bisogno solo di colori/pin/card (mappa, pannello regioni) importa da qui,
 * così three resta fuori dal bundle iniziale e fuori dal render SSR: viene
 * scaricato solo dal dynamic import (ssr:false) del globo vero e proprio.
 */

import { useLocale } from "next-intl";
import { globeCopy, globePinLabel } from "@/lib/globe-presentation";
import type { CityMarker, GlobeJob, PinKind } from "@/lib/dashboard-globe-data";
import { angularDistance } from "@/lib/globe-geometry";

export const PIN_COLORS: Record<PinKind, string> = { open: "#2ED69A", sent: "#3B82F6", desired: "#9B5CFF", saved: "#F6B73C" };
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
  lat: number;
  lng: number;
  kind: PinKind;
  total: number;
  isNew: boolean;
  cities: CityMarker[];
  job: GlobeJob | null;
}

export function esc(s: string | null | undefined): string {
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

/** Card visibili di default: 3 pin rilevanti e distanti tra loro. */
export function pickFeatured(pins: GlobePin[], visible: (p: GlobePin) => boolean, screen?: (p: GlobePin) => { x: number; y: number }): string[] {
  const score = (p: GlobePin) => p.cities.reduce((s, c) => s + c.counts.sent * 100 + c.counts.saved * 60 + c.counts.desired * 40 + (c.jobs[0]?.match ?? 0), 0) + Math.min(p.total, 20);
  const out: GlobePin[] = [];
  for (const p of [...pins].sort((a, b) => score(b) - score(a))) {
    if (out.length >= 3) break;
    if (!p.job || !visible(p)) continue;
    if (out.some((o) => angularDistance(o.lat, o.lng, p.lat, p.lng) < 20)) continue;
    // Le card sono larghe ~270px: due pin vicini sullo schermo si coprirebbero,
    // e una card non deve nascondere altri pin.
    if (screen) {
      const b = screen(p);
      if (out.some((o) => { const a = screen(o); return Math.abs(a.x - b.x) < 600 && Math.abs(a.y - b.y) < 200; })) continue;
      if (pins.some((q) => { if (q === p || !visible(q)) return false; const a = screen(q); return Math.abs(a.x - b.x) < 300 && Math.abs(a.y - b.y) < 150; })) continue;
    }
    out.push(p);
  }
  return out.map((p) => p.key);
}

function cardCopy(pin: GlobePin, locale: string) {
  const j = pin.job;
  const copy = globeCopy(locale);
  return {
    company: j?.company ?? (pin.kind === "desired" ? copy.desiredLocation : copy.company),
    role: j?.title ?? (pin.kind === "desired" ? copy.lookingHere : copy.noJobs),
    cta: copy.cta[pin.kind],
    href: j?.href ?? `/jobs?q=${encodeURIComponent(pin.name)}`,
  };
}

/** Job card React (mobile / liste). */
export function JobCard({ pin, selected, compact, onMore }: { pin: GlobePin; selected?: boolean; compact?: boolean; onMore?: (pin: GlobePin) => void }) {
  const locale = useLocale();
  const { company, role, cta, href } = cardCopy(pin, locale);
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
        <span className="dg-chip" style={{ ["--c" as string]: color }}>{globePinLabel(pin.kind, locale)}</span>
        {pin.job?.match != null && <span className="dg-chip" style={{ ["--c" as string]: PIN_COLORS.open }}>{Math.round(pin.job.match)}% match</span>}
      </div>
      {pin.total > 1 && <button type="button" className="dg-card-more" onClick={(e) => { e.stopPropagation(); onMore?.(pin); }}>{pin.name} · {pin.total} {globeCopy(locale).opportunities} →</button>}
      <a href={href} className="dg-card-cta" onClick={(e) => e.stopPropagation()}>{cta} <span aria-hidden="true">→</span></a>
    </div>
  );
}

/** Stessa card in HTML (per il layer HTML di three.js). */
export function jobCardHtml(pin: GlobePin, selected: boolean, locale: string): string {
  const { company, role, cta, href } = cardCopy(pin, locale);
  const color = PIN_COLORS[pin.kind];
  return `<div class="dg-card${selected ? " is-selected" : ""}" style="--c:${color}">
    <div class="dg-card-head">
      <span class="dg-logo" style="background:hsl(${hue(company)} 45% 22%);color:hsl(${hue(company)} 70% 78%)">${esc(initials(company))}</span>
      <div class="dg-card-txt"><div class="dg-card-co">${esc(company)}</div><div class="dg-card-role">${esc(role)}</div><div class="dg-card-loc">${esc(pin.name)}${pin.country ? `, ${esc(pin.country)}` : ""}</div></div>
    </div>
    <div class="dg-card-chips"><span class="dg-chip" style="--c:${color}">${esc(globePinLabel(pin.kind, locale))}</span>${pin.job?.match != null ? `<span class="dg-chip" style="--c:${PIN_COLORS.open}">${Math.round(pin.job.match)}% match</span>` : ""}</div>
    ${pin.total > 1 ? `<button type="button" class="dg-card-more" data-more="1">${esc(pin.name)} · ${pin.total} ${esc(globeCopy(locale).opportunities)} →</button>` : ""}
    <a href="${esc(href)}" class="dg-card-cta">${cta} <span aria-hidden="true">→</span></a>
  </div>`;
}

