"use client";

import { useState } from "react";
import { areaPath, monotonePath, niceMax } from "./chart-path";

export interface TrendWeek {
  start: string; // YYYY-MM-DD, rolling 7-day window start
  end: string; // YYYY-MM-DD, inclusive
  sent: number;
  replies: number;
}

/**
 * Weekly trend: delivery-confirmed sends vs recruiter replies, last 8 weeks.
 * Hand-rolled SVG; lines use non-scaling strokes so the chart can stretch to
 * the card width while keeping 1.5px hairlines. Labels and the tooltip are
 * HTML positioned in percentages, so nothing is distorted.
 */
export function WeeklyTrendChart({
  weeks,
  locale,
  labels,
}: {
  weeks: TrendWeek[];
  locale: string;
  labels: { sent: string; replies: string; chart: string };
}) {
  const [active, setActive] = useState<number | null>(null);
  const W = 100;
  const H = 100;
  const n = weeks.length;
  const max = niceMax(Math.max(...weeks.map((w) => Math.max(w.sent, w.replies))));
  const ticks = [0, max / 2, max];
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - (v / max) * H;
  const sentPts = weeks.map((w, i) => ({ x: x(i), y: y(w.sent) }));
  const replyPts = weeks.map((w, i) => ({ x: x(i), y: y(w.replies) }));
  const sentLine = monotonePath(sentPts);
  const replyLine = monotonePath(replyPts);
  const fmt = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
  const label = (iso: string) => fmt.format(new Date(`${iso}T00:00:00Z`));
  const range = (w: TrendWeek) => `${label(w.start)} – ${label(w.end)}`;
  const summary = weeks.map((w) => `${range(w)}: ${w.sent} ${labels.sent}, ${w.replies} ${labels.replies}`).join("; ");

  return (
    <div className="dash-trend">
      <div className="dash-trend-plot" onMouseLeave={() => setActive(null)}>
        <div className="dash-trend-yaxis" aria-hidden>
          {ticks.slice().reverse().map((t) => <span key={t}>{Number.isInteger(t) ? t : t.toFixed(1)}</span>)}
        </div>
        <div className="dash-trend-canvas">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${labels.chart}. ${summary}`}>
            <defs>
              <linearGradient id="dash-trend-sent" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--d-green)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--d-green)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((t) => (
              <line key={t} x1="0" x2={W} y1={y(t)} y2={y(t)} className="dash-trend-grid" vectorEffect="non-scaling-stroke" />
            ))}
            <path d={areaPath(sentLine, sentPts, H)} fill="url(#dash-trend-sent)" className="dash-trend-fade" />
            <path d={replyLine} fill="none" className="dash-trend-line is-replies dash-trend-fade" vectorEffect="non-scaling-stroke" />
            <path d={sentLine} fill="none" className="dash-trend-line is-sent dash-trend-fade" vectorEffect="non-scaling-stroke" />
            {active !== null && (
              <line x1={x(active)} x2={x(active)} y1="0" y2={H} className="dash-trend-cursor" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          {active !== null && (
            <>
              <span className="dash-trend-dot is-replies" style={{ left: `${x(active)}%`, top: `${y(weeks[active].replies)}%` }} aria-hidden />
              <span className="dash-trend-dot is-sent" style={{ left: `${x(active)}%`, top: `${y(weeks[active].sent)}%` }} aria-hidden />
              <div
                className={`dash-trend-tip${active > n / 2 ? " is-left" : ""}`}
                style={{ left: `${x(active)}%` }}
                role="status"
              >
                <div className="dash-trend-tip-title">{range(weeks[active])}</div>
                <div><span className="dash-legend-swatch is-sent" />{labels.sent}<b>{weeks[active].sent}</b></div>
                <div><span className="dash-legend-swatch is-replies" />{labels.replies}<b>{weeks[active].replies}</b></div>
              </div>
            </>
          )}
          <div className="dash-trend-hits">
            {weeks.map((w, i) => (
              <button
                key={w.start}
                type="button"
                className="dash-trend-hit"
                style={{ left: `${n === 1 ? 0 : ((i - 0.5) / (n - 1)) * 100}%`, width: `${n === 1 ? 100 : 100 / (n - 1)}%` }}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                aria-label={`${range(w)}: ${w.sent} ${labels.sent}, ${w.replies} ${labels.replies}`}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="dash-trend-xaxis" aria-hidden>
        {weeks.map((w, i) => (
          <span key={w.start} style={{ left: `${x(i)}%` }} className={(n - 1 - i) % 2 === 1 ? "is-minor" : undefined}>{label(w.end)}</span>
        ))}
      </div>
    </div>
  );
}
