"use client";

/**
 * Hero "Mappa globale delle opportunità" della dashboard utente.
 * Layer visivo (globo + persona, lazy/WebGL con fallback) + layer dati/UI:
 * barra filtri, stato live dell'AI, legenda, card mobile scorrevoli.
 */

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { CityMarker, GlobeStats, PinKind } from "@/lib/dashboard-globe-data";
import { PIN_COLORS, jobCardHtml, markerKind, type GlobeFilter } from "./dashboard-globe";

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

export function DashboardGlobeMap({ markers, stats, featuredKeys }: { markers: CityMarker[]; stats: GlobeStats; featuredKeys: string[] }) {
  const [filter, setFilter] = useState<GlobeFilter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Lista mobile: città visibili col filtro, ordinate per rilevanza.
  const mobileCards = useMemo(() => {
    const rows = markers
      .map((m) => ({ m, kind: markerKind(m, filter) }))
      .filter((r): r is { m: CityMarker; kind: PinKind } => r.kind != null && r.m.jobs.length > 0)
      .sort((a, b) => (a.m.key === selectedKey ? -1 : b.m.key === selectedKey ? 1 : 0) || (b.m.jobs[0]?.match ?? 0) - (a.m.jobs[0]?.match ?? 0));
    return rows.slice(0, 12);
  }, [markers, filter, selectedKey]);

  const count = (k: GlobeFilter) => (k === "all" ? stats.counts.open + stats.counts.sent + stats.counts.desired + stats.counts.saved : stats.counts[k]);

  return (
    <section className="dg-hero" aria-label="Mappa globale delle opportunità">
      <DashboardGlobe markers={markers} filter={filter} featuredKeys={featuredKeys} selectedKey={selectedKey} onSelect={setSelectedKey} />

      {/* Filtri (in alto, centrati) */}
      <div className="dg-filters" role="tablist" aria-label="Filtra la mappa">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={`dg-pill${filter === f.key ? " is-active" : ""}`} onClick={() => { setFilter(f.key); setSelectedKey(null); }}>
            {f.label}{f.key !== "all" && <span className="dg-pill-n">{count(f.key)}</span>}
          </button>
        ))}
      </div>

      {/* Stato live dell'AI (in alto a sinistra) */}
      <div className="dg-status">
        <div className="dg-status-title"><span className="dg-live" /> LavorAI sta cercando per te</div>
        <div className="dg-status-rows">
          <span><b>{stats.analyzed.toLocaleString("it-IT")}</b> posizioni analizzate</span>
          <span><b>{stats.compatible.toLocaleString("it-IT")}</b> compatibili</span>
          <span><b>{stats.newOpportunities.toLocaleString("it-IT")}</b> nuove opportunità</span>
        </div>
        <div className="dg-status-searching">Ricerca in corso<span className="dg-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></div>
      </div>

      {/* Legenda (in basso a sinistra) */}
      <div className="dg-legend" aria-label="Legenda">
        {LEGEND.map((l) => (
          <span key={l.key} className="dg-legend-row"><i style={{ background: PIN_COLORS[l.key], boxShadow: `0 0 8px ${PIN_COLORS[l.key]}` }} />{l.label}</span>
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

      {/* Mobile: card scorrevoli sotto il globo */}
      <div className="dg-mobile-cards" aria-label="Opportunità">
        {mobileCards.map(({ m, kind }) => (
          <div key={m.key} className={`dg-mobile-card${m.key === selectedKey ? " is-selected" : ""}`} onClick={() => setSelectedKey(m.key)} dangerouslySetInnerHTML={{ __html: jobCardHtml(m, kind, { selected: m.key === selectedKey, compact: true }) }} />
        ))}
      </div>
    </section>
  );
}
