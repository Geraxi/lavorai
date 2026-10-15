"use client";

/**
 * Pannello "Esplora per regione" (colonna destra della dashboard): scegli una
 * regione italiana, un paese o un'area; il globo ci zooma sopra e qui compaiono
 * conteggi e migliori opportunità della zona.
 */

import { useMemo } from "react";
import { useLocale } from "next-intl";
import Link from "next/link";
import { Icon } from "@/components/design/icon";
import { REGIONS, type RegionInfo } from "@/lib/city-centroids";
import { angularDistance, type CityMarker, type GlobeJob, type PinKind } from "@/lib/dashboard-globe-data";
import { regionDisplayName } from "@/lib/globe-presentation";
import { PIN_COLORS } from "./dashboard-globe";
import { useDashboardFocus } from "./dashboard-focus";

const QUICK = ["lombardia", "lazio", "piemonte", "emilia-romagna", "basilicata", "europa"];

export function inRegion(m: { lat: number; lng: number }, r: RegionInfo): boolean {
  return angularDistance(m.lat, m.lng, r.lat, r.lng) <= r.radius;
}

export function DashboardRegionPanel({ markers }: { markers: CityMarker[] }) {
  const { region, setRegionKey } = useDashboardFocus();
  const en = useLocale() === "en";
  const tr = (it: string, english: string) => en ? english : it;

  const stats = useMemo(() => {
    if (!region) return null;
    const inside = markers.filter((m) => inRegion(m, region));
    const counts: Record<PinKind, number> = { open: 0, sent: 0, desired: 0, saved: 0 };
    for (const m of inside) for (const k of Object.keys(counts) as PinKind[]) counts[k] += m.counts[k];
    const jobs: GlobeJob[] = inside.flatMap((m) => m.jobs).sort((a, b) => (a.kind === "sent" ? -1 : 0) - (b.kind === "sent" ? -1 : 0) || (b.match ?? 0) - (a.match ?? 0)).slice(0, 5);
    return { counts, jobs, cities: inside.length, total: counts.open + counts.sent + counts.desired + counts.saved };
  }, [markers, region]);

  const groups: RegionInfo["group"][] = ["Italia", "Paesi", "Aree"];

  return (
    <div className="fit-card dg-side-card dg-region">
      <div className="fit-card-head">
        <div className="fit-card-title"><Icon name="map-pin" size={15} /> {tr("Esplora per regione", "Explore by region")}</div>
        {region && <button type="button" className="fit-link" style={{ background: "transparent", border: 0, cursor: "pointer", font: "inherit" }} onClick={() => setRegionKey(null)}>{tr("Reset vista", "Reset view")}</button>}
      </div>
      <select className="fit-input dg-region-select" value={region?.key ?? ""} onChange={(e) => setRegionKey(e.target.value || null)} aria-label={tr("Scegli una regione", "Choose a region")}>
        <option value="">{tr("Tutto il mondo", "Worldwide")}</option>
        {groups.map((g) => (
          <optgroup key={g} label={en ? ({ Italia: "Italy", Paesi: "Countries", Aree: "Areas" }[g]) : g}>
            {REGIONS.filter((r) => r.group === g).map((r) => <option key={r.key} value={r.key}>{regionDisplayName(r, en ? "en" : "it")}</option>)}
          </optgroup>
        ))}
      </select>
      <div className="dg-region-quick">
        {QUICK.map((k) => { const r = REGIONS.find((x) => x.key === k)!; return <button key={k} type="button" className={`dg-pill${region?.key === k ? " is-active" : ""}`} onClick={() => setRegionKey(region?.key === k ? null : k)}>{regionDisplayName(r, en ? "en" : "it")}</button>; })}
      </div>
      {region && stats && (
        <div className="fit-body fit-scroll dg-region-body">
          <div className="dg-region-counts">
            <span><b style={{ color: PIN_COLORS.open }}>{stats.counts.open}</b> {tr("aperte", "open")}</span>
            <span><b style={{ color: PIN_COLORS.sent }}>{stats.counts.sent}</b> {tr("inviate", "submitted")}</span>
            <span><b style={{ color: PIN_COLORS.saved }}>{stats.counts.saved}</b> {tr("salvate", "saved")}</span>
            <span><b>{stats.cities}</b> {tr("città", stats.cities === 1 ? "city" : "cities")}</span>
          </div>
          {stats.jobs.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--fg-muted)", padding: "6px 0" }}>{tr("Nessuna opportunità trovata in", "No opportunities found in")} {regionDisplayName(region, en ? "en" : "it")} {tr("per ora.", "yet.")}</div>
          ) : (
            stats.jobs.map((j) => (
              <Link key={`${j.kind}-${j.id}`} href={j.href} className="fit-row" style={{ gridTemplateColumns: "8px 1fr auto", textDecoration: "none", color: "inherit", padding: "6px 0" }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: PIN_COLORS[j.kind] }} />
                <div style={{ minWidth: 0 }}>
                  <div className="fit-ellipsis" style={{ fontWeight: 600, fontSize: 12 }}>{j.title}</div>
                  <div className="fit-ellipsis" style={{ fontSize: 11, color: "var(--fg-muted)" }}>{j.company ?? tr("Azienda", "Company")}{j.location ? ` · ${j.location}` : ""}</div>
                </div>
                {j.match != null && <span className="dg-chip" style={{ ["--c" as string]: PIN_COLORS.open }}>{Math.round(j.match)}%</span>}
              </Link>
            ))
          )}
          <Link href={`/jobs?where=${encodeURIComponent(region.name)}`} className="fit-link" style={{ marginTop: 6 }}>{tr("Tutte le posizioni in", "All roles in")} {regionDisplayName(region, en ? "en" : "it")} <Icon name="arrow-right" size={12} /></Link>
        </div>
      )}
    </div>
  );
}
