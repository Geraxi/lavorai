/**
 * Skeleton specifico della dashboard: matcha il layout reale
 * (greeting + stat row + 7-day bar chart + sessions widget + recent
 * applications). Override del loading.tsx globale di (app).
 *
 * Coerenza visiva: stesso bg-elev + border-ds + shimmer del resto
 * del design system. L'utente percepisce "sta caricando la dashboard"
 * non "sta caricando una pagina generica".
 */
export default function DashboardLoading() {
  return (
    <div style={{ padding: "24px 32px", maxWidth: 1480, margin: "0 auto" }}>
      {/* Greeting + auto-apply status pill */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 14,
          marginBottom: 32,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Bar w={280} h={28} />
          <Bar w={420} h={14} muted />
          <Bar w={300} h={11} muted />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Bar w={120} h={28} rounded={999} />
          <Bar w={140} h={36} />
        </div>
      </div>

      {/* Stat row — 4 KPI cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginBottom: 22,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              padding: 20,
              borderRadius: 14,
              background: "var(--bg-elev)",
              border: "1px solid var(--border-ds)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <Bar w={100} h={11} muted />
            <Bar w={90} h={32} />
            <Bar w={140} h={11} muted />
          </div>
        ))}
      </div>

      {/* 7-day mini bar chart */}
      <div
        style={{
          padding: 20,
          borderRadius: 14,
          background: "var(--bg-elev)",
          border: "1px solid var(--border-ds)",
          marginBottom: 22,
        }}
      >
        <Bar w={180} h={14} />
        <div
          style={{
            marginTop: 16,
            display: "flex",
            alignItems: "flex-end",
            gap: 14,
            height: 120,
          }}
        >
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Bar
                w="100%"
                h={Math.max(20, 40 + Math.sin(i * 0.9) * 35)}
                rounded={4}
              />
              <Bar w={22} h={10} muted />
            </div>
          ))}
        </div>
      </div>

      {/* Sessions / round widget */}
      <div
        style={{
          padding: 20,
          borderRadius: 14,
          background: "var(--bg-elev)",
          border: "1px solid var(--border-ds)",
          marginBottom: 22,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <Bar w={200} h={14} />
        {[0, 1].map((i) => (
          <div
            key={i}
            style={{ display: "flex", alignItems: "center", gap: 14 }}
          >
            <Bar w={40} h={40} rounded={8} />
            <div
              style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}
            >
              <Bar w="60%" h={14} />
              <Bar w="40%" h={10} muted />
            </div>
            <Bar w={80} h={20} rounded={999} />
          </div>
        ))}
      </div>

      {/* Recent applications list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Bar w={200} h={14} />
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              padding: 14,
              borderRadius: 12,
              background: "var(--bg-elev)",
              border: "1px solid var(--border-ds)",
              display: "flex",
              gap: 12,
              alignItems: "center",
            }}
          >
            <Bar w={36} h={36} rounded={8} />
            <div
              style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}
            >
              <Bar w="50%" h={13} />
              <Bar w="30%" h={11} muted />
            </div>
            <Bar w={70} h={22} rounded={999} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({
  w,
  h,
  muted,
  rounded,
}: {
  w: number | string;
  h: number;
  muted?: boolean;
  rounded?: number;
}) {
  return (
    <div
      style={{
        width: typeof w === "number" ? `${w}px` : w,
        height: h,
        borderRadius: rounded ?? 6,
        background:
          "linear-gradient(90deg, var(--bg-sunken) 0%, var(--bg-elev) 50%, var(--bg-sunken) 100%)",
        backgroundSize: "200% 100%",
        animation: "ds-shimmer 1.4s linear infinite",
        opacity: muted ? 0.55 : 1,
      }}
    />
  );
}
