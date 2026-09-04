// Componenti UI condivisi tra le sub-route di /admin.
import Link from "next/link";
import type { ReactNode } from "react";

const TONE = {
  good: { fg: "hsl(var(--primary))", bg: "hsl(var(--primary)/0.12)", ring: "hsl(var(--primary)/0.35)" },
  warn: { fg: "#fbbf24", bg: "rgba(251,191,36,0.12)", ring: "rgba(251,191,36,0.4)" },
  bad: { fg: "#f87171", bg: "rgba(248,113,113,0.12)", ring: "rgba(248,113,113,0.4)" },
  info: { fg: "#60a5fa", bg: "rgba(96,165,250,0.12)", ring: "rgba(96,165,250,0.35)" },
} as const;

type Tone = keyof typeof TONE;

export function Kpi({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: Tone;
  icon?: ReactNode;
}) {
  const t = tone ? TONE[tone] : null;
  return (
    <div
      style={{
        position: "relative",
        padding: "18px 18px 16px",
        borderRadius: 14,
        background: "linear-gradient(180deg, var(--bg-elev) 0%, color-mix(in srgb, var(--bg-elev) 92%, transparent) 100%)",
        border: "1px solid var(--border-ds)",
        overflow: "hidden",
      }}
    >
      {t && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: `linear-gradient(90deg, ${t.fg}, transparent)`,
          }}
        />
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 600 }}>{label}</div>
        {icon && (
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              display: "grid",
              placeItems: "center",
              background: t?.bg ?? "var(--bg-sunken)",
              color: t?.fg ?? "var(--fg-subtle)",
            }}
          >
            {icon}
          </div>
        )}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: t?.fg ?? "var(--fg)", marginTop: 8, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 4, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

export function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section style={{ padding: 20, borderRadius: 16, background: "var(--bg-elev)", border: "1px solid var(--border-ds)", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 8 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", margin: 0 }}>{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return <th style={{ padding: "8px 10px", fontWeight: 600, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--fg-subtle)", textAlign: "left" }}>{children}</th>;
}
export function Td({ children }: { children: ReactNode }) {
  return <td style={{ padding: "9px 10px", fontSize: 12.5, color: "var(--fg)" }}>{children}</td>;
}
export function TierChip({ tier }: { tier: string }) {
  const map: Record<string, { bg: string; c: string; l: string }> = {
    free: { bg: "var(--bg-sunken)", c: "var(--fg-muted)", l: "Free" },
    pro: { bg: "rgba(37,99,235,0.18)", c: "#60a5fa", l: "Pro" },
    pro_plus: { bg: "hsl(var(--primary)/0.2)", c: "hsl(var(--primary))", l: "Pro+" },
  };
  const s = map[tier] ?? map.free;
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: s.bg, color: s.c }}>{s.l}</span>;
}

export function SectionCard({
  href,
  label,
  metric,
  metricSub,
  desc,
  tone,
  icon,
}: {
  href: string;
  label: string;
  metric?: string | number;
  metricSub?: string;
  desc: string;
  tone?: Tone;
  icon?: ReactNode;
}) {
  const t = tone ? TONE[tone] : null;
  return (
    <Link href={href} className="admin-section-card" style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}>
      <div
        style={{
          position: "relative",
          padding: 18,
          borderRadius: 14,
          background: "var(--bg-elev)",
          border: "1px solid var(--border-ds)",
          height: "100%",
          boxSizing: "border-box",
          transition: "transform 160ms ease, border-color 160ms ease, background 160ms ease",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
            {icon && (
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  display: "grid",
                  placeItems: "center",
                  background: t?.bg ?? "var(--bg-sunken)",
                  color: t?.fg ?? "var(--fg-muted)",
                  flexShrink: 0,
                }}
              >
                {icon}
              </div>
            )}
            <div style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "-0.01em" }}>{label}</div>
          </div>
          <div className="admin-arrow" style={{ fontSize: 14, color: "var(--fg-subtle)", transition: "transform 160ms ease, color 160ms ease" }}>→</div>
        </div>
        {metric != null && (
          <div style={{ fontSize: 22, fontWeight: 700, color: t?.fg ?? "var(--fg)", marginTop: 12, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{metric}</div>
        )}
        {metricSub && <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 3 }}>{metricSub}</div>}
        <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: metric != null ? 10 : 8, lineHeight: 1.55 }}>{desc}</div>
      </div>
    </Link>
  );
}

// Bar chart SVG server-rendered, dependency-free. Si adatta in larghezza
// (preserveAspectRatio none) così riempie il contenitore.
export function BarChart({
  data,
  labels,
  color = "hsl(var(--primary))",
  height = 88,
}: {
  data: number[];
  labels?: string[];
  color?: string;
  height?: number;
}) {
  const n = data.length;
  if (n === 0) return null;
  const max = Math.max(1, ...data);
  const slot = 10;
  const barW = 6;
  const W = n * slot;
  const gradId = `bar-grad-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.95" />
          <stop offset="100%" stopColor={color} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      {data.map((v, i) => {
        const bh = max > 0 ? (v / max) * (height - 2) : 0;
        return (
          <rect
            key={i}
            x={i * slot + (slot - barW) / 2}
            y={height - bh}
            width={barW}
            height={bh}
            rx={1.5}
            fill={v === 0 ? "var(--border-ds)" : `url(#${gradId})`}
            opacity={v === 0 ? 0.5 : 1}
          >
            <title>{labels?.[i] ? `${labels[i]}: ${v}` : String(v)}</title>
          </rect>
        );
      })}
    </svg>
  );
}

export function ChartCard({
  title,
  total,
  totalTone,
  children,
  footer,
}: {
  title: string;
  total?: string | number;
  totalTone?: Tone;
  children: ReactNode;
  footer?: string;
}) {
  const t = totalTone ? TONE[totalTone] : null;
  return (
    <div style={{ padding: 18, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 600 }}>{title}</div>
        {total != null && (
          <div style={{ fontSize: 19, fontWeight: 700, color: t?.fg ?? "var(--fg)", letterSpacing: "-0.02em" }}>{total}</div>
        )}
      </div>
      <div style={{ marginTop: 14 }}>{children}</div>
      {footer && <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginTop: 10 }}>{footer}</div>}
    </div>
  );
}

export function PageTitle({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div>
        <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 600 }}>
          Internal · Admin
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.025em", margin: "6px 0 0" }}>
          {title}
        </h1>
        {sub && <p style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 5 }}>{sub}</p>}
      </div>
      {actions && <div>{actions}</div>}
    </div>
  );
}

// Lista di pill "chiave: valore" ordinata per valore desc, ottima per group-by
// (submitConfirmation, submittedVia, status, kind…). Sostituisce le concat " · ".
export function StatPills({
  items,
  emptyLabel = "nessun dato",
  highlightPrefix,
}: {
  items: Array<{ key: string; value: number }>;
  emptyLabel?: string;
  highlightPrefix?: string;
}) {
  if (items.length === 0) return <div style={{ fontSize: 12.5, color: "var(--fg-subtle)" }}>{emptyLabel}</div>;
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const sorted = [...items].sort((a, b) => b.value - a.value);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {sorted.map((it) => {
        const hot = highlightPrefix && it.key.startsWith(highlightPrefix);
        const pct = Math.round((it.value / total) * 100);
        return (
          <div
            key={it.key}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 11px",
              borderRadius: 999,
              background: hot ? "hsl(var(--primary)/0.12)" : "var(--bg-sunken)",
              border: `1px solid ${hot ? "hsl(var(--primary)/0.35)" : "var(--border-ds)"}`,
              fontSize: 11.5,
            }}
          >
            <span style={{ color: hot ? "hsl(var(--primary))" : "var(--fg-muted)", fontWeight: 500 }}>{it.key}</span>
            <span style={{ color: hot ? "hsl(var(--primary))" : "var(--fg)", fontWeight: 700 }}>{it.value}</span>
            <span style={{ color: "var(--fg-subtle)", fontSize: 10.5 }}>{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

// Card azione (bottone + descrizione) — usata in /admin/jobs per i controlli manuali.
export function ActionCard({
  title,
  desc,
  icon,
  tone,
  children,
}: {
  title: string;
  desc: string;
  icon?: ReactNode;
  tone?: Tone;
  children: ReactNode;
}) {
  const t = tone ? TONE[tone] : null;
  return (
    <div style={{ padding: 16, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {icon && (
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              display: "grid",
              placeItems: "center",
              background: t?.bg ?? "var(--bg-sunken)",
              color: t?.fg ?? "var(--fg-muted)",
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</div>
          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 4, lineHeight: 1.55 }}>{desc}</div>
          <div style={{ marginTop: 12 }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

// Pill di stato generico (verificato / test / warn) — riutilizzabile.
export function StatusPill({ label, tone = "info" }: { label: string; tone?: Tone }) {
  const t = TONE[tone];
  return (
    <span
      style={{
        fontSize: 10.5,
        padding: "2px 8px",
        borderRadius: 999,
        background: t.bg,
        color: t.fg,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────
// KPI premium: cifra grande, delta % trend, sparkline area, icona tone.
// Usa gradient area chart per un look "market data".
export function KpiTrendCard({
  label,
  value,
  sub,
  delta,
  series,
  color = "hsl(var(--primary))",
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  delta?: number; // percentuale (positiva/negativa)
  series: number[];
  color?: string;
  icon?: ReactNode;
}) {
  const trendUp = delta != null && delta >= 0;
  const trendColor = delta == null ? "var(--fg-subtle)" : trendUp ? "hsl(var(--primary))" : "#f87171";
  return (
    <div
      style={{
        position: "relative",
        padding: "18px 18px 12px",
        borderRadius: 14,
        background: "var(--bg-elev)",
        border: "1px solid var(--border-ds)",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {icon && (
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              display: "grid",
              placeItems: "center",
              background: `color-mix(in srgb, ${color} 15%, transparent)`,
              color,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        )}
        <div style={{ fontSize: 11.5, color: "var(--fg-muted)", fontWeight: 500 }}>{label}</div>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: "var(--fg)", letterSpacing: "-0.025em", lineHeight: 1, fontFeatureSettings: '"tnum"' }}>
          {value}
        </div>
        {delta != null && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 700, color: trendColor }}>
            <span>{trendUp ? "↑" : "↓"}</span>
            <span>{trendUp ? "+" : ""}{delta.toFixed(0)}%</span>
          </div>
        )}
      </div>
      {sub && <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 4 }}>{sub}</div>}

      <div style={{ marginTop: 10, marginLeft: -18, marginRight: -18, marginBottom: -12 }}>
        <Sparkline data={series} color={color} height={54} />
      </div>
    </div>
  );
}

// Area sparkline SVG con gradient — full-width, dependency-free.
export function Sparkline({
  data,
  color = "hsl(var(--primary))",
  height = 50,
}: {
  data: number[];
  color?: string;
  height?: number;
}) {
  if (data.length < 2) return <div style={{ height }} />;
  const W = 200;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = Math.max(1, max - min);
  const step = W / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / span) * (height - 6) - 3;
    return `${x},${y}`;
  });
  const line = `M${pts.join(" L")}`;
  const area = `${line} L${W},${height} L0,${height} Z`;
  const gradId = `spark-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Line chart multi-serie SVG, con grid soft e legenda esterna. viewBox fisso,
// preserveAspectRatio "none" per riempire il container in larghezza.
export function LineChart({
  series,
  labels,
  height = 260,
}: {
  series: Array<{ label: string; color: string; data: number[] }>;
  labels: string[];
  height?: number;
}) {
  const W = 700;
  const H = height;
  const padL = 30;
  const padR = 8;
  const padT = 12;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = labels.length;
  const step = n > 1 ? innerW / (n - 1) : innerW;
  const allVals = series.flatMap((s) => s.data);
  const max = Math.max(1, ...allVals);
  const yTicks = 4;
  const ptTo = (v: number, i: number) => {
    const x = padL + i * step;
    const y = padT + innerH - (v / max) * innerH;
    return [x, y] as const;
  };
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 10, fontSize: 11.5 }}>
        {series.map((s) => (
          <div key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--fg-muted)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color }} />
            {s.label}
          </div>
        ))}
      </div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
        {/* grid */}
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const y = padT + (i / yTicks) * innerH;
          const val = Math.round((1 - i / yTicks) * max);
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--border-ds)" strokeWidth={0.5} strokeDasharray="2 3" />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={9.5} fill="var(--fg-subtle)">{val}</text>
            </g>
          );
        })}
        {/* x labels — sample every ~3 */}
        {labels.map((l, i) => {
          if (n <= 8 || i % Math.ceil(n / 7) === 0 || i === n - 1) {
            const x = padL + i * step;
            return (
              <text key={i} x={x} y={H - 6} textAnchor="middle" fontSize={9.5} fill="var(--fg-subtle)">{l}</text>
            );
          }
          return null;
        })}
        {series.map((s) => {
          const pts = s.data.map((v, i) => ptTo(v, i));
          const line = "M" + pts.map(([x, y]) => `${x},${y}`).join(" L");
          const area = `${line} L${padL + (n - 1) * step},${padT + innerH} L${padL},${padT + innerH} Z`;
          const gradId = `line-grad-${s.label.replace(/[^a-z0-9]/gi, "")}`;
          return (
            <g key={s.label}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area} fill={`url(#${gradId})`} />
              <path d={line} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {pts.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={2.5} fill={s.color}>
                  <title>{`${labels[i]}: ${s.data[i]}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Donut chart SVG con label centrale.
export function Donut({
  segments,
  center,
  size = 180,
  thickness = 22,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  center?: { top: string | number; bottom?: string };
  size?: number;
  thickness?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - thickness / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth={thickness} />
        {total > 0 &&
          segments.map((s, i) => {
            const frac = s.value / total;
            const len = frac * circ;
            const gap = circ - len;
            const offset = -acc * circ;
            acc += frac;
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${gap}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
                transform={`rotate(-90 ${cx} ${cy})`}
              >
                <title>{`${s.label}: ${s.value}`}</title>
              </circle>
            );
          })}
      </svg>
      {center && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--fg)", letterSpacing: "-0.02em", lineHeight: 1 }}>{center.top}</div>
            {center.bottom && <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{center.bottom}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// Barra funnel colorata (una riga).
export function FunnelBar({
  label,
  value,
  max,
  pct,
  color,
}: {
  label: string;
  value: number | string;
  max: number;
  pct: string;
  color: string;
}) {
  const width = max > 0 ? Math.min(100, (Number(value) / max) * 100) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 60px 50px", gap: 10, alignItems: "center", padding: "8px 0", fontSize: 12 }}>
      <div style={{ color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ height: 8, background: "var(--bg-sunken)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${width}%`, height: "100%", background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 60%, transparent))`, borderRadius: 4 }} />
      </div>
      <div style={{ textAlign: "right", color: "var(--fg)", fontWeight: 700, fontFeatureSettings: '"tnum"' }}>{value.toLocaleString?.("it-IT") ?? value}</div>
      <div style={{ textAlign: "right", color: "var(--fg-subtle)", fontFeatureSettings: '"tnum"' }}>{pct}</div>
    </div>
  );
}

// Riga stato servizio (icona + label + pill + micro-bar + %).
export function ServiceRow({
  label,
  icon,
  status,
  uptime,
  history,
}: {
  label: string;
  icon?: ReactNode;
  status: "ok" | "warn" | "down";
  uptime: number; // 0..100
  history?: number[]; // 0..1 per micro-bar
}) {
  const map = {
    ok: { c: "hsl(var(--primary))", l: "Operativo" },
    warn: { c: "#fbbf24", l: "Degradato" },
    down: { c: "#f87171", l: "Down" },
  } as const;
  const s = map[status];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "24px 1fr auto 88px 46px", gap: 10, alignItems: "center", padding: "9px 4px", fontSize: 12 }}>
      <div style={{ color: "var(--fg-muted)", display: "grid", placeItems: "center" }}>{icon}</div>
      <div style={{ color: "var(--fg)", fontWeight: 500 }}>{label}</div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: s.c, fontWeight: 600 }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: s.c, boxShadow: `0 0 6px ${s.c}` }} />
        {s.l}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 18 }}>
        {(history ?? new Array(16).fill(1)).map((v, i) => (
          <div key={i} style={{ flex: 1, height: `${Math.max(15, v * 100)}%`, background: s.c, opacity: 0.35 + v * 0.5, borderRadius: 1 }} />
        ))}
      </div>
      <div style={{ textAlign: "right", color: "var(--fg)", fontFeatureSettings: '"tnum"', fontWeight: 600 }}>{uptime.toFixed(1)}%</div>
    </div>
  );
}

// Riga attività recente (icona + descrizione + meta + orario).
export function ActivityRow({
  icon,
  tone = "info",
  desc,
  meta,
  when,
}: {
  icon: ReactNode;
  tone?: Tone;
  desc: string;
  meta?: string;
  when: string;
}) {
  const t = TONE[tone];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 12, alignItems: "center", padding: "10px 4px", borderBottom: "1px solid var(--border-ds)", fontSize: 12.5 }}>
      <div style={{ width: 22, height: 22, borderRadius: 6, background: t.bg, color: t.fg, display: "grid", placeItems: "center" }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{desc}</div>
        {meta && <div style={{ fontSize: 11, color: "var(--fg-subtle)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{meta}</div>}
      </div>
      <div style={{ fontSize: 11, color: "var(--fg-subtle)", whiteSpace: "nowrap" }}>{when}</div>
    </div>
  );
}

// Alert item (row per Alert/Errore/Avviso/Info).
export function AlertRow({
  icon,
  tone,
  title,
  detail,
  when,
}: {
  icon: ReactNode;
  tone: Tone;
  title: string;
  detail?: string;
  when: string;
}) {
  const t = TONE[tone];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "32px 1fr auto", gap: 12, alignItems: "flex-start", padding: "11px 4px", borderBottom: "1px solid var(--border-ds)" }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: t.bg, color: t.fg, display: "grid", placeItems: "center", flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: "var(--fg)", fontWeight: 600 }}>{title}</div>
        {detail && <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 2, lineHeight: 1.45 }}>{detail}</div>}
      </div>
      <div style={{ fontSize: 11, color: "var(--fg-subtle)", whiteSpace: "nowrap" }}>{when}</div>
    </div>
  );
}

// Format helper — mostra numeri grandi in stile compatto (12.4K, 1.2M).
export function compactNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + "K";
  return n.toString();
}

export function SectionHeader({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div style={{ marginBottom: 14, display: "flex", alignItems: "baseline", gap: 10 }}>
      {eyebrow && (
        <span style={{ fontSize: 10, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 600 }}>
          {eyebrow}
        </span>
      )}
      <span style={{ fontSize: 14, color: "var(--fg)", fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</span>
      <span style={{ flex: 1, height: 1, background: "var(--border-ds)" }} />
    </div>
  );
}
