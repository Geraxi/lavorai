"use client";

import { useState } from "react";
import { areaPath, monotonePath, niceMax } from "./chart-path";

export interface TrendBucket {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD, inclusive
}

export interface TrendSeries {
  key: string;
  label: string;
  /** "green" = evidence series (filled), "neutral" = comparison line. */
  tone: "green" | "neutral";
  values: number[];
}

/**
 * Smooth area/line chart for a few real series over date buckets.
 * Hand-rolled SVG: non-scaling hairline strokes, HTML-positioned labels and
 * tooltip (percentages), hover + keyboard focus per bucket. No chart library.
 */
export function TrendChart({
  buckets,
  series,
  locale,
  ariaLabel,
  height,
}: {
  buckets: TrendBucket[];
  series: TrendSeries[];
  locale: string;
  ariaLabel: string;
  height?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const W = 100;
  const H = 100;
  const n = buckets.length;
  const peak = Math.max(0, ...series.flatMap((s) => s.values));
  // Counts are integers: keep the mid tick integral too (no "0.5" on small data).
  let max = niceMax(peak);
  if (series.every((s) => s.values.every(Number.isInteger)) && !Number.isInteger(max / 2)) max = Math.max(2, Math.ceil(max / 2) * 2);
  const ticks = [0, max / 2, max];
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - (v / max) * H;
  const fmt = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
  const label = (iso: string) => fmt.format(new Date(`${iso}T00:00:00Z`));
  const range = (b: TrendBucket) => (b.start === b.end ? label(b.start) : `${label(b.start)} – ${label(b.end)}`);
  const lines = series.map((s) => {
    const pts = s.values.map((v, i) => ({ x: x(i), y: y(v) }));
    const line = monotonePath(pts);
    return { ...s, pts, line, area: s.tone === "green" ? areaPath(line, pts, H) : "" };
  });
  const describe = (i: number) => `${range(buckets[i])}: ${series.map((s) => `${s.values[i]} ${s.label}`).join(", ")}`;
  const ordered = [...lines].sort((a, b) => Number(a.tone === "green") - Number(b.tone === "green")); // green drawn last (on top)

  return (
    <div className="pm-trend">
      <div className="pm-trend-plot" style={height ? { height } : undefined} onMouseLeave={() => setActive(null)}>
        <div className="pm-trend-yaxis" aria-hidden>
          {ticks.slice().reverse().map((t) => <span key={t}>{Number.isInteger(t) ? t : t.toFixed(1)}</span>)}
        </div>
        <div className="pm-trend-canvas">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${ariaLabel}. ${buckets.map((_, i) => describe(i)).join("; ")}`}>
            <defs>
              <linearGradient id="pm-trend-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--pm-green)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--pm-green)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((t) => <line key={t} x1="0" x2={W} y1={y(t)} y2={y(t)} className="pm-trend-grid" vectorEffect="non-scaling-stroke" />)}
            {ordered.map((s) => s.area && <path key={`${s.key}-a`} d={s.area} fill="url(#pm-trend-fill)" className="pm-trend-fade" />)}
            {ordered.map((s) => (
              <path key={s.key} d={s.line} fill="none" className={`pm-trend-line ${s.tone === "green" ? "is-sent" : "is-replies"} pm-trend-fade`} vectorEffect="non-scaling-stroke" />
            ))}
            {active !== null && <line x1={x(active)} x2={x(active)} y1="0" y2={H} className="pm-trend-cursor" vectorEffect="non-scaling-stroke" />}
          </svg>
          {active !== null && (
            <>
              {lines.map((s) => (
                <span key={s.key} className={`pm-trend-dot ${s.tone === "green" ? "is-sent" : "is-replies"}`} style={{ left: `${x(active)}%`, top: `${y(s.values[active])}%` }} aria-hidden />
              ))}
              <div className={`pm-trend-tip${active > n / 2 ? " is-left" : ""}`} style={{ left: `${x(active)}%` }} role="status">
                <div className="pm-trend-tip-title">{range(buckets[active])}</div>
                {lines.map((s) => (
                  <div key={s.key}><span className={`pm-legend-swatch ${s.tone === "green" ? "is-sent" : "is-replies"}`} />{s.label}<b>{s.values[active]}</b></div>
                ))}
              </div>
            </>
          )}
          <div className="pm-trend-hits">
            {buckets.map((b, i) => (
              <button
                key={b.start}
                type="button"
                className="pm-trend-hit"
                style={{ left: `${n === 1 ? 0 : ((i - 0.5) / (n - 1)) * 100}%`, width: `${n === 1 ? 100 : 100 / (n - 1)}%` }}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                aria-label={describe(i)}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="pm-trend-xaxis" aria-hidden>
        {buckets.map((b, i) => (
          <span key={b.start} style={{ left: `${x(i)}%` }} className={(n - 1 - i) % 2 === 1 ? "is-minor" : undefined}>{label(b.end)}</span>
        ))}
      </div>
    </div>
  );
}

/** Legend for a TrendChart, meant for the card head. */
export function TrendLegend({ series }: { series: { key: string; label: string; tone: "green" | "neutral" }[] }) {
  return (
    <ul className="pm-legend is-head" aria-hidden>
      {series.map((s) => <li key={s.key}><span className={`pm-legend-swatch ${s.tone === "green" ? "is-sent" : "is-replies"}`} />{s.label}</li>)}
    </ul>
  );
}
