"use client";

/**
 * Hero "Mappa globale delle opportunità": globo (immagine) + layer dati/UI:
 * pill filtri attaccate al globo, stato live dell'AI leggero, legenda
 * discreta, sheet laterale per le città con più opportunità, card
 * scorrevoli su mobile.
 */

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { CityMarker, GlobeStats, PinKind } from "@/lib/dashboard-globe-data";
import { PIN_COLORS, PIN_LABELS, buildPins, JobCard, type GlobeFilter, type GlobePin } from "./dashboard-globe";
import { useDashboardFocus } from "./dashboard-focus";
import { regionAltitude } from "@/lib/city-centroids";

const DashboardGlobe = dynamic(() => import("./dashboard-globe").then((m) => m.DashboardGlobe), {
  ssr: false,
  loading: () => <div className="dg-fallback"><div className="dg-fallback-earth" /><span>Carico il mondo…</span></div>,
});

const FILTERS: Array<{ key: GlobeFilter; label: string }> = [
  { key: "all", label: "Tutto" },
  { key: "open", label: "Opportunità" },
  { key: "sent", label: "Inviate" },
  { key: "desired", label: "Desiderate" },
  { key: "saved", label: "Salvate" },
];
const LEGEND: Array<{ key: PinKind; label: string }> = [
  { key: "open", label: "Opportunità" },
  { key: "sent", label: "Candidature inviate" },
  { key: "desired", label: "Posizioni desiderate" },
  { key: "saved", label: "Salvate" },
];

export function DashboardGlobeMap({ markers, stats, greeting }: { markers: CityMarker[]; stats: GlobeStats; greeting?: React.ReactNode }) {
  const [filter, setFilter] = useState<GlobeFilter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sheet, setSheet] = useState<GlobePin | null>(null);
  const { region, setRegionKey } = useDashboardFocus();
  const focus = region ? { key: region.key, lat: region.lat, lng: region.lng, altitude: regionAltitude(region.radius) } : null;

  const mobilePins = useMemo(() => buildPins(markers, filter, 3).filter((p) => p.job).slice(0, 12), [markers, filter]);
  const count = (k: GlobeFilter) => (k === "all" ? stats.counts.open + stats.counts.sent + stats.counts.desired + stats.counts.saved : stats.counts[k]);
  const sheetJobs = sheet ? sheet.cities.flatMap((c) => c.jobs).filter((j) => filter === "all" || j.kind === filter) : [];

  return (
    <section className="dg-hero" aria-label="Mappa globale delle opportunità">
      <div className="dg-stage">
        <DashboardGlobe markers={markers} filter={filter} selectedKey={selectedKey} onSelect={(k) => { setSelectedKey(k); setSheet(null); }} onMore={(p) => setSheet(p)} focus={focus} />
      </div>

      {greeting && <div className="dg-greeting">{greeting}</div>}

      {/* Filtri, attaccati al bordo alto del globo */}
      <div className="dg-filters" role="tablist" aria-label="Filtra la mappa">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={`dg-pill${filter === f.key ? " is-active" : ""}`} onClick={() => { setFilter(f.key); setSelectedKey(null); setSheet(null); }}>
            {f.label}{f.key !== "all" && <span className="dg-pill-n">{count(f.key)}</span>}
          </button>
        ))}
      </div>

      {/* Stato live dell'AI: una riga leggera, niente box */}
      <div className="dg-status">
        <div className="dg-status-title"><span className="dg-live" /> LavorAI sta cercando per te</div>
        <div className="dg-status-line"><b>{stats.analyzed.toLocaleString("it-IT")}</b> analizzate · <b>{stats.compatible.toLocaleString("it-IT")}</b> compatibili · <b>{stats.newOpportunities.toLocaleString("it-IT")}</b> nuove</div>
        <div className="dg-status-searching">Ricerca in corso<span className="dg-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></div>
        {region && <button type="button" className="dg-zone" onClick={() => setRegionKey(null)}>Zona: <b>{region.name}</b> <span aria-hidden="true">×</span></button>}
      </div>

      <div className="dg-legend" aria-label="Legenda">
        {LEGEND.map((l) => (
          <span key={l.key} className="dg-legend-row"><i style={{ background: PIN_COLORS[l.key], boxShadow: `0 0 6px ${PIN_COLORS[l.key]}` }} />{l.label}</span>
        ))}
      </div>
      <div className="dg-hint" aria-hidden="true">Trascina per ruotare · scroll per zoom · clicca un pin</div>

      {markers.length === 0 && (
        <div className="dg-empty">
          <b>Nessuna opportunità sulla mappa, per ora.</b>
          <span>Imposta i ruoli e le località che ti interessano: LavorAI inizierà a cercare in tutto il mondo.</span>
          <Link href="/preferences" className="ds-btn ds-btn-sm ds-btn-primary">Imposta le preferenze</Link>
        </div>
      )}

      {/* Sheet laterale: tutte le opportunità di una città/cluster */}
      {sheet && (
        <aside className="dg-sheet" aria-label={`Opportunità a ${sheet.name}`}>
          <div className="dg-sheet-head">
            <div>
              <div className="dg-sheet-title">{sheet.name}</div>
              <div className="dg-sheet-sub">{sheet.total} opportunità{sheet.cities.length > 1 ? ` · ${sheet.cities.map((c) => c.name).join(", ")}` : ""}</div>
            </div>
            <button type="button" className="dg-sheet-close" aria-label="Chiudi" onClick={() => setSheet(null)}>×</button>
          </div>
          <div className="dg-sheet-list">
            {sheetJobs.map((j) => (
              <a key={`${j.kind}-${j.id}`} href={j.href} className="dg-sheet-row">
                <span className="dg-sheet-dot" style={{ background: PIN_COLORS[j.kind] }} />
                <span className="dg-sheet-txt"><b>{j.company ?? "Azienda"}</b><span>{j.title}</span></span>
                <span className="dg-sheet-meta">{j.match != null ? `${Math.round(j.match)}%` : PIN_LABELS[j.kind]}</span>
              </a>
            ))}
          </div>
          <Link href={`/jobs?q=${encodeURIComponent(sheet.name)}`} className="dg-card-cta">Vedi tutte a {sheet.name} <span aria-hidden="true">→</span></Link>
        </aside>
      )}

      {/* Mobile: card scorrevoli sotto il globo */}
      <div className="dg-mobile-cards" aria-label="Opportunità">
        {mobilePins.map((p) => (
          <div key={p.key} className={`dg-mobile-card${p.key === selectedKey ? " is-selected" : ""}`} onClick={() => setSelectedKey(p.key)}>
            <JobCard pin={p} compact selected={p.key === selectedKey} onMore={(x) => setSheet(x)} />
          </div>
        ))}
      </div>
    </section>
  );
}
