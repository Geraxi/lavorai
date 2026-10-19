import { areaPath, monotonePath } from "./chart-path";

/**
 * 30-day sparkline for a KPI card. Plots the running total of real daily
 * events in the window. Fewer than 2 events → no curve, only an honest note.
 */
export function Sparkline({
  id,
  daily,
  tone,
  emptyLabel,
  ariaLabel,
}: {
  id: string;
  daily: number[] | null;
  tone: "green" | "neutral";
  emptyLabel: string;
  ariaLabel: string;
}) {
  const events = daily?.reduce((a, b) => a + b, 0) ?? 0;
  if (!daily || events < 2) return <span className="pm-spark-empty">{emptyLabel}</span>;

  const W = 100;
  const H = 32;
  let total = 0;
  const cumulative = daily.map((v) => (total += v));
  const max = cumulative[cumulative.length - 1] || 1;
  const points = cumulative.map((v, i) => ({
    x: (i / (cumulative.length - 1)) * W,
    y: H - 2 - (v / max) * (H - 6),
  }));
  const line = monotonePath(points);
  const gradientId = `pm-spark-${id}`;
  const last = points[points.length - 1];

  return (
    <svg className={`pm-spark tone-${tone}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={ariaLabel}>
      <title>{ariaLabel}</title>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.16" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath(line, points, H)} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <line x1={last.x} x2={last.x} y1={last.y} y2={last.y} stroke="currentColor" strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
