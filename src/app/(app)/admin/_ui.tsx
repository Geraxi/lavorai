// Componenti UI condivisi tra le sub-route di /admin.

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
