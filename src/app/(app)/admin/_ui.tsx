// Componenti UI condivisi tra le sub-route di /admin.
import Link from "next/link";

export function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "good" | "warn";
}) {
  const color = tone === "good" ? "hsl(var(--primary))" : tone === "warn" ? "#fbbf24" : "var(--fg)";
  return (
    <div style={{ padding: 16, borderRadius: 12, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
      <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color, marginTop: 4, letterSpacing: "-0.01em" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: 18, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)", marginBottom: 16 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 12 }}>{title}</h2>
      {children}
    </section>
  );
}

export function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "6px 10px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>{children}</th>;
}
export function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "7px 10px" }}>{children}</td>;
}
export function TierChip({ tier }: { tier: string }) {
  const map: Record<string, { bg: string; c: string; l: string }> = {
    free: { bg: "var(--bg-sunken)", c: "var(--fg-muted)", l: "Free" },
    pro: { bg: "rgba(37,99,235,0.18)", c: "#60a5fa", l: "Pro" },
    pro_plus: { bg: "hsl(var(--primary)/0.2)", c: "hsl(var(--primary))", l: "Pro+" },
  };
  const s = map[tier] ?? map.free;
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: s.bg, color: s.c }}>{s.l}</span>;
}

export function SectionCard({
  href,
  label,
  metric,
  metricSub,
  desc,
  tone,
}: {
  href: string;
  label: string;
  metric?: string | number;
  metricSub?: string;
  desc: string;
  tone?: "good" | "warn";
}) {
  const color = tone === "good" ? "hsl(var(--primary))" : tone === "warn" ? "#fbbf24" : "var(--fg)";
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}>
      <div
        style={{
          padding: 16,
          borderRadius: 12,
          background: "var(--bg-elev)",
          border: "1px solid var(--border-ds)",
          height: "100%",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em" }}>{label}</div>
          <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>→</div>
        </div>
        {metric != null && (
          <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 8, letterSpacing: "-0.01em" }}>{metric}</div>
        )}
        {metricSub && <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 2 }}>{metricSub}</div>}
        <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: metric != null ? 8 : 6, lineHeight: 1.5 }}>{desc}</div>
      </div>
    </Link>
  );
}

// Bar chart SVG server-rendered, dependency-free. Si adatta in larghezza
// (preserveAspectRatio none) così riempie il contenitore. Ogni barra ha un
// <title> per il tooltip nativo (label: valore).
export function BarChart({
  data,
  labels,
  color = "hsl(var(--primary))",
  height = 84,
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
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      style={{ display: "block" }}
    >
      {data.map((v, i) => {
        const bh = max > 0 ? (v / max) * (height - 2) : 0;
        return (
          <rect
            key={i}
            x={i * slot + (slot - barW) / 2}
            y={height - bh}
            width={barW}
            height={bh}
            rx={1}
            fill={color}
            opacity={v === 0 ? 0.18 : 0.85}
          >
            <title>{labels?.[i] ? `${labels[i]}: ${v}` : String(v)}</title>
          </rect>
        );
      })}
    </svg>
  );
}

// Card contenitore per un grafico: titolo, totale opzionale, grafico, footer.
export function ChartCard({
  title,
  total,
  totalTone,
  children,
  footer,
}: {
  title: string;
  total?: string | number;
  totalTone?: "good" | "warn";
  children: React.ReactNode;
  footer?: string;
}) {
  const totalColor =
    totalTone === "good" ? "hsl(var(--primary))" : totalTone === "warn" ? "#fbbf24" : "var(--fg)";
  return (
    <div style={{ padding: 16, borderRadius: 12, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{title}</div>
        {total != null && (
          <div style={{ fontSize: 18, fontWeight: 700, color: totalColor, letterSpacing: "-0.01em" }}>{total}</div>
        )}
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
      {footer && <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginTop: 8 }}>{footer}</div>}
    </div>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 11, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
        Internal · Admin
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", margin: "4px 0 0" }}>
        {title}
      </h1>
      {sub && <p style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 4 }}>{sub}</p>}
    </div>
  );
}
