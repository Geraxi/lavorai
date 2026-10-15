"use client";

/**
 * Hero "Mappa globale delle opportunità": globo (immagine) + layer dati/UI:
 * pill filtri attaccate al globo, stato live dell'AI leggero, legenda
 * discreta, sheet laterale per le città con più opportunità, card
 * scorrevoli su mobile.
 */

import dynamic from "next/dynamic";
import { useLocale } from "next-intl";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { CityMarker, GlobeStats, PinKind } from "@/lib/dashboard-globe-data";
import { PIN_COLORS, buildPins, JobCard, type GlobeFilter, type GlobePin } from "./dashboard-globe";
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
  const en = useLocale() === "en";
  const tr = (it: string, english: string) => en ? english : it;
  const label = (key: GlobeFilter) => ({ all: tr("Tutto", "All"), open: tr("Opportunità", "Opportunities"), sent: tr("Inviate", "Submitted"), desired: tr("Desiderate", "Preferred"), saved: tr("Salvate", "Saved") }[key]);
  const [filter, setFilter] = useState<GlobeFilter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sheet, setSheet] = useState<GlobePin | null>(null);
  const { region, setRegionKey } = useDashboardFocus();
  const focus = region ? { key: region.key, lat: region.lat, lng: region.lng, altitude: regionAltitude(region.radius) } : null;

  const mobilePins = useMemo(() => buildPins(markers, filter, 3).filter((p) => p.job).slice(0, 12), [markers, filter]);
  const count = (k: GlobeFilter) => (k === "all" ? stats.counts.open + stats.counts.sent + stats.counts.desired + stats.counts.saved : stats.counts[k]);
  const sheetJobs = sheet ? sheet.cities.flatMap((c) => c.jobs).filter((j) => filter === "all" || j.kind === filter) : [];

  return (
    <section className="dg-hero" aria-label={tr("Mappa globale delle opportunità", "Global opportunity map")}>
      <div className="dg-stage">
        <DashboardGlobe markers={markers} filter={filter} selectedKey={selectedKey} onSelect={(k) => { setSelectedKey(k); setSheet(null); }} onMore={(p) => setSheet(p)} focus={focus} />
      </div>

      {greeting && <div className="dg-greeting">{greeting}</div>}

      {/* Filtri, attaccati al bordo alto del globo */}
      <div className="dg-filters" role="tablist" aria-label={tr("Filtra la mappa", "Filter map")}>
        {FILTERS.map((f) => (
          <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={`dg-pill${filter === f.key ? " is-active" : ""}`} onClick={() => { setFilter(f.key); setSelectedKey(null); setSheet(null); }}>
            {label(f.key)}{f.key !== "all" && <span className="dg-pill-n">{count(f.key)}</span>}
          </button>
        ))}
      </div>

      {/* Stato live dell'AI: una riga leggera, niente box */}
      <div className="dg-status">
        <div className="dg-status-title"><span className="dg-live" /> {tr("Opportunità registrate", "Recorded opportunities")}</div>
        <div className="dg-status-line"><b>{stats.analyzed.toLocaleString(en ? "en-GB" : "it-IT")}</b> {tr("nel catalogo", "in the catalog")} · <b>{stats.compatible.toLocaleString(en ? "en-GB" : "it-IT")}</b> {tr("compatibili", "matching")} · <b>{stats.newOpportunities.toLocaleString(en ? "en-GB" : "it-IT")}</b> {tr("nuove", "new")}</div>
        <div className="dg-status-searching">{tr("Dati aggiornati al caricamento", "Data as of page load")}</div>
        {region && <button type="button" className="dg-zone" onClick={() => setRegionKey(null)}>{tr("Zona", "Area")}: <b>{region.name}</b> <span aria-hidden="true">×</span></button>}
      </div>

      <div className="dg-legend" aria-label={tr("Legenda", "Legend")}>
        {LEGEND.map((l) => (
          <span key={l.key} className="dg-legend-row"><i style={{ background: PIN_COLORS[l.key], boxShadow: `0 0 6px ${PIN_COLORS[l.key]}` }} />{label(l.key)}</span>
        ))}
      </div>
      <div className="dg-hint" aria-hidden="true">{tr("Trascina per ruotare · scroll per zoom · clicca un pin", "Drag to rotate · scroll to zoom · select a pin")}</div>

      {markers.length === 0 && (
        <div className="dg-empty">
          <b>{tr("Nessuna opportunità sulla mappa, per ora.", "No mapped opportunities yet.")}</b>
          <span>{tr("Imposta i ruoli e le località che ti interessano.", "Set the roles and locations you are interested in.")}</span>
          <Link href="/preferences" className="ds-btn ds-btn-sm ds-btn-primary">{tr("Imposta le preferenze", "Set preferences")}</Link>
        </div>
      )}

      {/* Sheet laterale: tutte le opportunità di una città/cluster */}
      {sheet && (
        <aside className="dg-sheet" aria-label={`${tr("Opportunità a", "Opportunities in")} ${sheet.name}`}>
          <div className="dg-sheet-head">
            <div>
              <div className="dg-sheet-title">{sheet.name}</div>
              <div className="dg-sheet-sub">{sheet.total} {tr("opportunità", "opportunities")}{sheet.cities.length > 1 ? ` · ${sheet.cities.map((c) => c.name).join(", ")}` : ""}</div>
            </div>
            <button type="button" className="dg-sheet-close" aria-label={tr("Chiudi", "Close")} onClick={() => setSheet(null)}>×</button>
          </div>
          <div className="dg-sheet-list">
            {sheetJobs.map((j) => (
              <a key={`${j.kind}-${j.id}`} href={j.href} className="dg-sheet-row">
                <span className="dg-sheet-dot" style={{ background: PIN_COLORS[j.kind] }} />
                <span className="dg-sheet-txt"><b>{j.company ?? tr("Azienda", "Company")}</b><span>{j.title}</span></span>
                <span className="dg-sheet-meta">{j.match != null ? `${Math.round(j.match)}%` : label(j.kind)}</span>
              </a>
            ))}
          </div>
          <Link href={`/jobs?where=${encodeURIComponent(sheet.name)}`} className="dg-card-cta">{tr("Vedi tutte a", "View all in")} {sheet.name} <span aria-hidden="true">→</span></Link>
        </aside>
      )}

      {/* Mobile: card scorrevoli sotto il globo */}
      <div className="dg-mobile-cards" aria-label={tr("Opportunità", "Opportunities")}>
        {mobilePins.map((p) => (
          <div key={p.key} className={`dg-mobile-card${p.key === selectedKey ? " is-selected" : ""}`} role="group" aria-label={`${p.name}: ${p.total} ${tr("opportunità", "opportunities")}`}>
            <button type="button" className="dg-mobile-card-focus" aria-pressed={p.key === selectedKey} onClick={() => setSelectedKey(p.key === selectedKey ? null : p.key)}>
              {p.key === selectedKey ? tr("Nascondi dal globo", "Hide on globe") : tr("Mostra sul globo", "Show on globe")}
            </button>
            <JobCard pin={p} compact selected={p.key === selectedKey} onMore={(x) => setSheet(x)} />
          </div>
        ))}
      </div>
    </section>
  );
}
